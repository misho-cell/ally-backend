import { query } from '../../db/postgres/client';
import { buildSearchTerms, buildRawWordGroups } from './transliterate';
import { buildExactMatchSql } from './wordMatch';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { applyFacts, ContactFactFields, fetchFactsForPhones } from './factEnrichment';
import {
  AccountDetails,
  accountDetailsFor,
  fetchAccountStates,
  isMemberPhone,
  isSubscriberPhone,
  accountStateFor,
} from './membership';
import {
  fetchRelationshipForPhones,
  RelationshipInfo,
  fetchHumanTierForPhones,
  HumanTier,
} from './relationshipScores';
import { fetchExclusionsForPhones, ContactExclusion } from './contactExclusions';
import { phoneDigits } from '../phone';
import { OWNERSHIP } from './searchResultMeta';
import { collapseMergedPhones } from './mergedIdentities';

const FUZZY_THRESHOLD = 0.45;
// The first letters a fuzzy neighbour must share with the term (see the
// fallback below): two, at a word start.
const FUZZY_HEAD_CHARS = 2;
const RESULT_LIMIT = 20;

interface NameRow {
  phone: string;
  word_hits?: number | string | null;
  name: string | null;
  saved_as: string | null;
  all_tags: string[];
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
}

function toRow(
  row: NameRow,
  facts: Map<string, ContactFactFields>,
  accountStates: Map<string, AccountDetails>,
  relationships: Map<string, RelationshipInfo>,
  exclusions: Map<string, ContactExclusion[]>,
  humanTiers: Map<string, HumanTier>,
  // A row that matched fewer query words than the query has — or came from
  // the fuzzy fallback — is a letter-similar neighbour, not the person asked
  // for. Tag searches already carry the flag; name searches did not (task 40).
  approximate?: boolean,
): Record<string, unknown> {
  const base = applyFacts(
    {
      phone: row.phone,
      name: row.name ?? null,
      tags: (row.all_tags || []).filter(Boolean),
      employer: row.employer ?? null,
      jobPosition: row.jobPosition ?? null,
      city: row.city ?? null,
    },
    facts,
  );
  const rel = relationships.get(row.phone);
  const excl = exclusions.get(phoneDigits(row.phone));
  const humanTier = humanTiers.get(row.phone);
  return {
    ...base,
    is_member: isMemberPhone(accountStates, row.phone),
    account_state: accountStateFor(accountStates, row.phone),
    netai_subscriber: isSubscriberPhone(accountStates, row.phone),
    ownership: OWNERSHIP.DIRECT,
    saved_as: row.saved_as ?? null,
    // Enrichment-computed edge category (family/close/professional/formal) —
    // lets the agent phrase how well the user knows this person. The numeric
    // strength stays server-side: a raw score printed to a user is a leak
    // (ticket 3 §6.0 — "relationship_strength 0.65" reached a reply).
    ...(rel && { relationship: rel.relationship }),
    // A tier the USER set by hand (today: old-Ally's colour classification) —
    // never computed, never overwritten by `relationship` above (ticket 6
    // task 4's conflict rule). Separate field on purpose, so the two are
    // never confused for each other.
    ...(humanTier && { human_relationship_tier: humanTier }),
    // The user's own recorded "not this person, for this" decisions.
    ...(excl && excl.length > 0 && { exclusions: excl }),
    ...(approximate === true && { approximate: true }),
  };
}

export async function searchContactByName(userId: string, nameQuery: string): Promise<object> {
  try {
    const blockedPhones = await getExcludedPhones(userId);
    // Normalized set catches format variants the SQL exact match would miss.
    const excludedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => excludedSet.has(normalizePhone(phone));
    // Word-start regex matches a name part by prefix ("gio" → "Giorgi") without
    // matching a fragment inside another word ("japan" ↛ "Japaridze") (ISSUE 3).
    const rawGroups = buildRawWordGroups(nameQuery);
    if (rawGroups.length === 0) return { found: false, query: nameQuery };
    // Match each query word across ALL of a contact's labels — every
    // contributor's alias, the registered name, AND every tag — on the user's
    // OWN contacts (the "mine" set). So a surname another contributor added
    // ("Salome Jojua") surfaces her even when the user saved her as just "Salome"
    // (Bug 1), and a person is found by a nickname/group tag as readily as by
    // their display name. word_hits (distinct query words matched across labels)
    // ranks the one matching every word first ("Dachi Axel" → the person with the
    // `dachi` tag AND `axel`, not the ~150 who match one — Bug 2). Every branch
    // is driven FROM the materialized mine set (see buildExactMatchSql) so the
    // plan stays index-backed at prod scale — the previous shape tipped the
    // statement timeout on the founder's account.
    const m = buildExactMatchSql(userId, rawGroups, blockedPhones);
    const mineCte = `mine AS MATERIALIZED (
       SELECT phone FROM "UserTags"  WHERE "contactId" = $1
       UNION
       SELECT phone FROM "UserAlias" WHERE "contactId" = $1
     )`;
    const hitsCte = `hits AS (
       SELECT phone, (${m.wordHits}) AS word_hits, MAX(priority) AS src_priority
       FROM matched
       WHERE phone != ALL($${m.blockIdx})
       GROUP BY phone
     )`;
    // name prefers the REGISTERED name over the phonebook label: junk labels
    // ("LIST. Lika Osepashvili. Ally. Force") were handed to the model as the
    // person's name and it reasoned from them (task 42). The raw label always
    // rides in saved_as. Empty strings count as missing everywhere (task 43).
    const aggSelect = `SELECT h.phone,
              MAX(h.word_hits)                     AS word_hits,
              COALESCE(NULLIF(TRIM(MAX(u.name)), ''), MAX(ua.alias)) AS name,
              MAX(ua.alias)                        AS saved_as,
              array_agg(DISTINCT ut.tag)           AS all_tags,
              MAX(NULLIF(TRIM(u.employer), ''))    AS employer,
              MAX(NULLIF(TRIM(u."jobPosition"), '')) AS "jobPosition",
              MAX(NULLIF(TRIM(u.city), ''))        AS city
       FROM hits h
       LEFT JOIN "UserAlias" ua ON ua.phone = h.phone AND ua."contactId" = $1
       LEFT JOIN "UserTags"  ut ON ut.phone = h.phone
       LEFT JOIN "UserPhone" up ON up.phone = h.phone
       LEFT JOIN "User"      u  ON u.id     = up."userId"
       GROUP BY h.phone`;

    const [result, countResult] = await Promise.all([
      query<NameRow>(
        `WITH ${mineCte}, ${m.matchedCte}, ${hitsCte}
         ${aggSelect}
         ORDER BY MAX(h.word_hits) DESC, MAX(h.src_priority) DESC, MAX(ua.alias)
         LIMIT ${RESULT_LIMIT}`,
        m.params,
      ),
      query<{ total: string }>(`WITH ${mineCte}, ${m.matchedCte} ${m.totalSql}`, m.params),
    ]);

    const rows = result.rows.filter((r) => !isExcluded(r.phone));
    const total = Number(countResult.rows[0]?.total ?? rows.length);

    if (rows.length === 0) {
      // Fallback: fuzzy similarity search via pg_trgm (catches typos like livingston/livingstone)
      try {
        const fuzzyTerms = nameQuery
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .flatMap((word) => buildSearchTerms(word))
          .map((t) => t.toLowerCase());
        // Answers-12 Part B: a similarity hit must also share the term's first
        // letters at a word start — „Xoruashvili" used to come back as
        // Shubashvili, Samadashvili, Tarielashvili on the shared -ashvili tail
        // alone, which is noise, not a near match.
        const fuzzyConds = fuzzyTerms
          .map((_, i) => {
            const term = `$${i + 2}`;
            const head = `('\\m' || LEFT(${term}, ${FUZZY_HEAD_CHARS}))`;
            return (
              `(word_similarity(${term}, LOWER(a.alias)) > ${FUZZY_THRESHOLD} AND LOWER(a.alias) ~ ${head})` +
              ` OR (word_similarity(${term}, LOWER(u2.name)) > ${FUZZY_THRESHOLD} AND LOWER(u2.name) ~ ${head})`
            );
          })
          .join(' OR ');
        const fuzzyBlockParamIdx = fuzzyTerms.length + 2;
        const fuzzyMineCte = `mine AS (
           SELECT phone FROM "UserTags"  WHERE "contactId" = $1
           UNION
           SELECT phone FROM "UserAlias" WHERE "contactId" = $1
         )`;

        const fuzzyResult = await query<NameRow>(
          `WITH ${fuzzyMineCte},
           hits AS (
             SELECT DISTINCT a.phone
             FROM "UserAlias" a
             LEFT JOIN "UserPhone" up2 ON up2.phone = a.phone
             LEFT JOIN "User"      u2  ON u2.id     = up2."userId"
             WHERE a.phone IN (SELECT phone FROM mine)
               AND (${fuzzyConds})
               AND a.phone != ALL($${fuzzyBlockParamIdx})
           )
           SELECT h.phone,
                  COALESCE(NULLIF(TRIM(MAX(u.name)), ''), MAX(ua.alias)) AS name,
                  MAX(ua.alias)                        AS saved_as,
                  array_agg(DISTINCT ut.tag)           AS all_tags,
                  MAX(NULLIF(TRIM(u.employer), ''))    AS employer,
                  MAX(NULLIF(TRIM(u."jobPosition"), '')) AS "jobPosition",
                  MAX(NULLIF(TRIM(u.city), ''))        AS city
           FROM hits h
           LEFT JOIN "UserAlias" ua ON ua.phone = h.phone AND ua."contactId" = $1
           LEFT JOIN "UserTags"  ut ON ut.phone = h.phone
           LEFT JOIN "UserPhone" up ON up.phone = h.phone
           LEFT JOIN "User"      u  ON u.id     = up."userId"
           GROUP BY h.phone
           ORDER BY MAX(ua.alias)
           LIMIT 20`,
          [userId, ...fuzzyTerms, blockedPhones],
        );

        const fuzzyRows = fuzzyResult.rows.filter((r) => !isExcluded(r.phone));
        if (fuzzyRows.length > 0) {
          const fuzzyPhones = fuzzyRows.map((r) => r.phone);
          const [facts, accountStates, relationships, exclusions, humanTiers] = await Promise.all([
            fetchFactsForPhones(userId, fuzzyPhones),
            fetchAccountStates(fuzzyPhones),
            fetchRelationshipForPhones(userId, fuzzyPhones),
            fetchExclusionsForPhones(userId, fuzzyPhones),
            fetchHumanTierForPhones(userId, fuzzyPhones),
          ]);
          return {
            found: true,
            count: fuzzyRows.length,
            total: fuzzyRows.length,
            fuzzy: true,
            results: fuzzyRows.map((row) =>
              toRow(row, facts, accountStates, relationships, exclusions, humanTiers, true),
            ),
          };
        }
      } catch {
        // pg_trgm not available — skip fuzzy fallback
      }
      return { found: false, query: nameQuery };
    }

    const phones = rows.map((r) => r.phone);
    const [facts, accountStates, relationships, exclusions, humanTiers] = await Promise.all([
      fetchFactsForPhones(userId, phones),
      fetchAccountStates(phones),
      fetchRelationshipForPhones(userId, phones),
      fetchExclusionsForPhones(userId, phones),
      fetchHumanTierForPhones(userId, phones),
    ]);
    const mapped = rows.map((row) =>
      toRow(
        row,
        facts,
        accountStates,
        relationships,
        exclusions,
        humanTiers,
        Number(row.word_hits ?? rawGroups.length) < rawGroups.length,
      ),
    );
    // Task 27's ranking half: within the page, the record that actually KNOWS
    // something (facts, role, membership) outranks an empty shell — the empty
    // twin used to sit above the real Salome.
    const richness = (r: Record<string, unknown>): number =>
      (r.employer ? 1 : 0) +
      (r.jobPosition ? 1 : 0) +
      (r.city ? 1 : 0) +
      (r.is_member === true ? 1 : 0) +
      (r.relationship ? 1 : 0);
    mapped.sort((a, b) => richness(b) - richness(a));
    // Task 54: two member rows under ONE name must be tellable apart — attach
    // member_since / network_size / activity to every row in a duplicated name
    // group, so neither the user nor the assistant aims at the wrong twin.
    await attachDuplicateDifferentiators(mapped, accountStates);
    // Ticket 16 Task 23: the review's „one person" answers, finally read. The
    // differentiators above answer the same question for REGISTERED twins by
    // account id; this covers every pair a human confirmed, registered or not.
    const merged = await collapseMergedPhones(mapped);
    return {
      found: true,
      count: merged.rows.length,
      total: total - merged.collapsed,
      results: merged.rows,
    };
  } catch (err) {
    console.error('searchContactByName error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}

/**
 * For every group of 2+ rows sharing a display name, attach what tells them
 * apart — never the number, which the assistant cannot see (Ticket 10 Task 3,
 * D28).
 *
 * Two shapes. (1) The rows are ONE PERSON with several numbers: the founder's
 * two phones sat in Lika's phonebook as two „Tornike Abuladze" rows, and the
 * assistant, with nothing to tell them apart, asked her which Tornike she
 * meant. Same account id ⇒ `same_person`, and the assistant is told so in
 * words. (2) The rows are different people: each carries a `differentiator`
 * built from what IS visible — company, title, city, how they were saved, the
 * relationship — and member rows additionally carry registration date, network
 * size and activity (ticket 6 task 54, founder's yes; one query, duplicated
 * phones only).
 */
async function attachDuplicateDifferentiators(
  mapped: Array<Record<string, unknown>>,
  accountStates: Map<string, AccountDetails>,
): Promise<void> {
  const byName = new Map<string, Array<Record<string, unknown>>>();
  for (const r of mapped) {
    const key = String(r.name ?? '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    const group = byName.get(key) ?? [];
    group.push(r);
    byName.set(key, group);
  }
  const groups = [...byName.values()].filter((g) => g.length > 1);
  if (groups.length === 0) return;

  for (const group of groups) {
    const ids = group.map((r) => accountDetailsFor(accountStates, String(r.phone)).user_id);
    const onePerson = ids[0] !== null && ids.every((id) => id === ids[0]);
    for (const r of group) {
      r.duplicate_name = true;
      if (onePerson) {
        r.same_person = true;
        r.same_person_hint = `One person with ${group.length} numbers — do not ask which one is meant; any of these rows is them.`;
      } else {
        r.differentiator = differentiatorFor(r);
      }
    }
  }

  const duplicated = groups
    .flat()
    .filter((r) => r.same_person !== true && isMemberPhone(accountStates, String(r.phone)));
  if (duplicated.length === 0) return;
  try {
    const dupPhones = duplicated.map((r) => String(r.phone));
    const info = await query<{
      phone: string;
      member_since: string;
      network_size: string;
      threads_count: string;
    }>(
      `SELECT up.phone,
              u."createdAt" AS member_since,
              (SELECT COUNT(*) FROM "UserAlias" ua WHERE ua."contactId" = u.id) AS network_size,
              (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id) AS threads_count
       FROM "UserPhone" up
       JOIN "User" u ON u.id = up."userId"
       WHERE up.phone = ANY($1) AND u."deletedAt" IS NULL`,
      [dupPhones],
    );
    const byPhone = new Map(info.rows.map((r) => [r.phone, r]));
    for (const r of duplicated) {
      const d = byPhone.get(String(r.phone));
      if (!d) continue;
      r.member_since = d.member_since;
      r.network_size = Number(d.network_size);
      // A dormant twin is exactly the account an introduction must not be
      // silently aimed at (answer 7's problem, both doors now covered).
      r.activity = Number(d.threads_count) > 0 ? 'active' : 'dormant';
    }
  } catch (err) {
    // Differentiators are best-effort — a failure must not break the search.
    console.error('duplicate differentiators failed:', (err as Error).message);
  }
}

/**
 * What tells one namesake from another, in words the assistant may repeat:
 * company, title, city, the label they were saved under, the relationship, and
 * whether they use Netai. Never the number. An empty string means the record
 * itself cannot tell them apart, and the assistant should say so rather than
 * quote a blank.
 */
function differentiatorFor(r: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof r.jobPosition === 'string' && r.jobPosition) parts.push(r.jobPosition);
  if (typeof r.employer === 'string' && r.employer) parts.push(r.employer);
  if (typeof r.city === 'string' && r.city) parts.push(r.city);
  if (typeof r.saved_as === 'string' && r.saved_as && r.saved_as !== r.name) {
    parts.push(`saved as „${r.saved_as}"`);
  }
  if (typeof r.relationship === 'string' && r.relationship) parts.push(r.relationship);
  parts.push(r.is_member === true ? 'on Netai' : 'not on Netai');
  return parts.join(' · ');
}
