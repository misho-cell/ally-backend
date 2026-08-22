import { query } from '../../db/postgres/client';
import { buildSearchTerms, buildRawWordGroups } from './transliterate';
import { buildExactMatchSql } from './wordMatch';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { applyFacts, ContactFactFields, fetchFactsForPhones } from './factEnrichment';
import { fetchMembersForPhones, isMemberPhone } from './membership';
import { fetchRelationshipForPhones, RelationshipInfo } from './relationshipScores';
import { fetchExclusionsForPhones, ContactExclusion } from './contactExclusions';
import { phoneDigits } from '../phone';
import { OWNERSHIP } from './searchResultMeta';

const FUZZY_THRESHOLD = 0.45;
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
  members: Set<string>,
  relationships: Map<string, RelationshipInfo>,
  exclusions: Map<string, ContactExclusion[]>,
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
  return {
    ...base,
    is_member: isMemberPhone(members, row.phone),
    ownership: OWNERSHIP.DIRECT,
    saved_as: row.saved_as ?? null,
    // Enrichment-computed edge category (family/close/professional/formal) —
    // lets the agent phrase how well the user knows this person. The numeric
    // strength stays server-side: a raw score printed to a user is a leak
    // (ticket 3 §6.0 — "relationship_strength 0.65" reached a reply).
    ...(rel && { relationship: rel.relationship }),
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
        const fuzzyConds = fuzzyTerms
          .map(
            (_, i) =>
              `word_similarity($${i + 2}, LOWER(a.alias)) > ${FUZZY_THRESHOLD} OR word_similarity($${i + 2}, LOWER(u2.name)) > ${FUZZY_THRESHOLD}`,
          )
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
          const [facts, members, relationships, exclusions] = await Promise.all([
            fetchFactsForPhones(userId, fuzzyPhones),
            fetchMembersForPhones(fuzzyPhones),
            fetchRelationshipForPhones(userId, fuzzyPhones),
            fetchExclusionsForPhones(userId, fuzzyPhones),
          ]);
          return {
            found: true,
            count: fuzzyRows.length,
            total: fuzzyRows.length,
            fuzzy: true,
            results: fuzzyRows.map((row) =>
              toRow(row, facts, members, relationships, exclusions, true),
            ),
          };
        }
      } catch {
        // pg_trgm not available — skip fuzzy fallback
      }
      return { found: false, query: nameQuery };
    }

    const phones = rows.map((r) => r.phone);
    const [facts, members, relationships, exclusions] = await Promise.all([
      fetchFactsForPhones(userId, phones),
      fetchMembersForPhones(phones),
      fetchRelationshipForPhones(userId, phones),
      fetchExclusionsForPhones(userId, phones),
    ]);
    const mapped = rows.map((row) =>
      toRow(
        row,
        facts,
        members,
        relationships,
        exclusions,
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
    await attachDuplicateDifferentiators(mapped, members);
    return {
      found: true,
      count: mapped.length,
      total,
      results: mapped,
    };
  } catch (err) {
    console.error('searchContactByName error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}

/**
 * For every group of 2+ MEMBER rows sharing a display name, attach what tells
 * them apart: registration date, how many contacts their own phonebook holds,
 * and whether the account has ever been used (dormant = zero threads). One
 * query, only over the duplicated phones (ticket 6 task 54, founder's yes).
 */
async function attachDuplicateDifferentiators(
  mapped: Array<Record<string, unknown>>,
  members: Set<string>,
): Promise<void> {
  const byName = new Map<string, Array<Record<string, unknown>>>();
  for (const r of mapped) {
    if (!isMemberPhone(members, String(r.phone))) continue;
    const key = String(r.name ?? '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    const group = byName.get(key) ?? [];
    group.push(r);
    byName.set(key, group);
  }
  const duplicated = [...byName.values()].filter((g) => g.length > 1).flat();
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
      r.duplicate_name = true;
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
