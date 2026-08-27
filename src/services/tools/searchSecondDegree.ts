import { query } from '../../db/postgres/client';

const SECOND_DEGREE_QUERY_TIMEOUT_MS = 15_000;
import { getSession } from '../../db/neo4j/client';
import { getCompositeKeyForUser } from '../../services/neo4j.keys';
import { buildSearchTerms, toWordStartPattern } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { fetchExclusionsForPhones } from './contactExclusions';
import { phoneDigits } from '../phone';
import { normalizePhone } from '../phone';
import { OWNERSHIP } from './searchResultMeta';

const MAX_FRIEND_PHONES = 3000;
// A target reachable through MORE mutuals is a stronger, more-verified bridge —
// rank by that and cap at a real limit, so the right connection isn't lost in an
// arbitrary unordered slice (was an unranked LIMIT 20).
const SECOND_DEGREE_RESULT_LIMIT = 30;
const WEAK_TIE_SIGNAL_CAP = 3;

/**
 * If the second-degree query matches contacts the user ALREADY holds directly,
 * record a weak-tie signal on those edges (they asked for a path instead of
 * calling). Consumed as a down-rank when this user appears as a via-bridge in
 * other users' results. Best-effort — never blocks or fails the search.
 */
async function recordWeakTieSignals(userId: string, likeTerms: string[]): Promise<void> {
  if (likeTerms.length === 0) return;
  const likeOr = likeTerms.map((_, i) => `LOWER(alias) LIKE $${i + 2}`).join(' OR ');
  await query(
    `INSERT INTO weak_tie_signals (user_id, contact_phone)
     SELECT DISTINCT $1::int, phone
     FROM "UserAlias"
     WHERE "contactId" = $1 AND (${likeOr})
     LIMIT ${WEAK_TIE_SIGNAL_CAP}
     ON CONFLICT (user_id, contact_phone) DO NOTHING`,
    [userId, ...likeTerms],
  );
}

// Engine T15: "match strength returned, fact text never" (ticket 6, 20 Aug
// spec; named load-bearing again in the P0 round — this is the mechanism
// aggregate crowd evidence is supposed to reach a searcher through WITHOUT
// disclosure). A second-degree target's employer/jobPosition only surface
// when a fact is public or the searcher's own (privacy-correct — see
// fe/fj above) — which starves to null for almost every real second-degree
// case today (T10, 4 consecutive rounds: 0 of 936+ facts product-wide are
// public yet). signal_strength answers a narrower, safe question instead:
// "how well does this person match the query", scored from EVERY signal on
// them — public or not, anyone's tag or fact — while the actual matched
// word never leaves this function. Two components: how many DISTINCT
// contributors tagged them with a matching word (crowd corroboration, the
// Dato Q7 pattern — 22 people independently calling one man "shpana" is
// real signal even though no single submission is public), and whether any
// fact at all (public or private) matches — a coarse "yes/no" so a single
// private submission still helps rank without ever being readable.
const SIGNAL_TAG_WEIGHT = 0.15;
const SIGNAL_TAG_CAP = 3;
const SIGNAL_FACT_WEIGHT = 0.5;
const SIGNAL_MAX = 1.0;

// The 20 Aug spec, verbatim: "Facts tagged sensitive (health, money,
// politics, religion, love life) or ugly/unlawful are excluded from
// signalling entirely." No moderation classifier for "ugly/unlawful" exists
// in this codebase — this denylist is a real but partial safeguard, not the
// full spec; flagged honestly, not silently shipped as complete. 'note' is
// excluded outright — it's this codebase's own catch-all for "personal or
// ambiguous" content (contactFacts.service.ts's moderation comment), the
// exact shape sensitive material accumulates as, so it never contributes
// even without a category match.
const SIGNAL_EXCLUDED_FIELD_TYPES = [
  'note',
  'health',
  'medical',
  'illness',
  'diagnosis',
  'money',
  'income',
  'salary',
  'finance',
  'debt',
  'wealth',
  'politics',
  'political',
  'party',
  'religion',
  'religious',
  'faith',
  'relationship',
  'love',
  'dating',
  'marital_status',
  'affair',
  'criminal',
  'legal_issue',
  'arrest',
];

// Exported for T15's empty-case fallback in searchByInsight (ticket 7 task
// 10) — ONE strength vocabulary product-wide, never a re-guessed copy.
export async function fetchSignalStrength(
  phones: string[],
  regexTerms: string[],
): Promise<Map<string, number>> {
  if (phones.length === 0 || regexTerms.length === 0) return new Map();
  try {
    const tagConds = regexTerms.map((_, i) => `(LOWER(ut.tag) || '') ~ $${i + 2}`).join(' OR ');
    const excludedIdx = regexTerms.length + 2;
    const valueConds = regexTerms.map((_, i) => `(LOWER(cf.value) || '') ~ $${i + 2}`).join(' OR ');
    const result = await query<{ phone: string; strength: number }>(
      `SELECT p.phone,
              LEAST(${SIGNAL_MAX},
                ${SIGNAL_TAG_WEIGHT} * LEAST(${SIGNAL_TAG_CAP}, (
                  SELECT COUNT(DISTINCT ut."contactId") FROM "UserTags" ut
                  WHERE ut.phone = p.phone AND (${tagConds})
                ))
                + ${SIGNAL_FACT_WEIGHT} * (CASE WHEN EXISTS (
                    SELECT 1 FROM contact_facts cf
                    WHERE cf.neo4j_contact_id = p.phone AND cf.retracted_at IS NULL
                      AND cf.field_type != ALL($${excludedIdx}::text[])
                      AND (${valueConds})
                  ) THEN 1 ELSE 0 END)
              ) AS strength
       FROM unnest($1::text[]) AS p(phone)`,
      [phones, ...regexTerms, SIGNAL_EXCLUDED_FIELD_TYPES],
      SECOND_DEGREE_QUERY_TIMEOUT_MS,
    );
    return new Map(
      result.rows.filter((r) => Number(r.strength) > 0).map((r) => [r.phone, Number(r.strength)]),
    );
  } catch (err) {
    console.error('fetchSignalStrength error:', (err as Error).message);
    return new Map();
  }
}

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  try {
    let userKey: string;
    try {
      userKey = await getCompositeKeyForUser(Number(userId));
    } catch {
      return { found: false, reason: 'user_phone_not_found' };
    }

    // Step 1: get direct contact keys from Neo4j (capped to avoid large payloads).
    // Use indexed lookup: try composite key first, then fall back to individual phones
    // for legacy nodes that haven't been migrated yet (before neo4j_backfill runs).
    const userPhones = userKey.split('-');
    // One transient blip must not hollow out the whole answer — retry once with
    // a fresh session before declaring the graph down.
    let friendKeys: string[] = [];
    let graphDown = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = getSession();
      try {
        const neo4jResult = await session.run(
          `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
           RETURN DISTINCT friend.phoneKey AS phoneKey
           LIMIT ${MAX_FRIEND_PHONES}`,
          { userKey },
          { timeout: 8000 },
        );
        friendKeys = neo4jResult.records
          .map((r) => r.get('phoneKey') as string | null)
          .filter((p): p is string => p !== null);

        // Fallback: if composite key node has no contacts, try each individual phone key.
        // Old nodes use a single phone as the key instead of the composite format.
        if (friendKeys.length === 0 && userPhones.length > 1) {
          const fallback = await session.run(
            `UNWIND $userPhones AS phone
             MATCH (me:AllyNode {phoneKey: phone})-[:CONTACT]->(friend:AllyNode)
             RETURN DISTINCT friend.phoneKey AS phoneKey
             LIMIT ${MAX_FRIEND_PHONES}`,
            { userPhones },
            { timeout: 8000 },
          );
          friendKeys = fallback.records
            .map((r) => r.get('phoneKey') as string | null)
            .filter((p): p is string => p !== null);
        }
        graphDown = false;
        break;
      } catch (neo4jErr) {
        console.error(
          `searchSecondDegree neo4j error (attempt ${attempt + 1}/2):`,
          (neo4jErr as Error).message,
        );
        graphDown = true;
      } finally {
        await session.close();
      }
    }
    if (graphDown) {
      // Loud, honest degrade: the model must tell the user the answer is
      // partial, not silently thin it out as if the network were empty.
      return {
        found: false,
        reason: 'neo4j_unavailable',
        note:
          'The connection graph is TEMPORARILY unavailable — this is a technical outage, not an ' +
          'empty network. Tell the user plainly that second-degree paths are missing from this ' +
          'answer right now and offer to retry in a bit; do NOT conclude no path exists.',
      };
    }

    if (friendKeys.length === 0) return { found: false, reason: 'no_contacts_in_graph' };

    const blockedPhones = await getExcludedPhones(userId);
    const blockedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => blockedSet.has(normalizePhone(phone));

    // Composite keys (e.g. "+99551111-+99599999") must be expanded to individual phones
    // before matching against UserPhone which stores one row per phone.
    // Blocked phones are removed here to exclude them as intermediaries (via).
    const friendPhones = [...new Set(friendKeys.flatMap((k) => k.split('-')))].filter(
      (p) => !isExcluded(p),
    );

    if (friendPhones.length === 0) return { found: false, reason: 'no_contacts_in_graph' };

    // Step 2: search friends' contacts in PostgreSQL — filter first, join last
    const terms = buildSearchTerms(tagQuery);
    const likeTerms = terms.map((t) => '%' + t + '%');

    // Weak-tie signal: asking for a PATH to a contact you already hold directly
    // means that edge is weak. Record it (fire-and-forget) so this user is
    // down-ranked as a warm bridge to that person for OTHER users.
    void recordWeakTieSignals(userId, likeTerms).catch(() => undefined);

    // Matching is WORD-START on the RAW text, for tags and aliases alike, and
    // the normalize fold is OUT of second-degree entirely — a product call as
    // much as a perf one (tester findings, 7 Aug):
    //  - the folded similarity match returned Khazaradze rows for "kasradze"
    //    (k↔kh/x collapse) — wrong results, not just slow ones;
    //  - the same fold turned 'axel' into '%akel%', whose trigrams sit inside
    //    half of Georgian surnames — every trigram-index path exploded there
    //    (gate or recheck, it only moved between deploys);
    //  - mid-word substring hits (Margita for "gita") were wrong AND heavy.
    // Cross-script coverage still comes from buildSearchTerms' per-script
    // variants; ღ-drift tolerance is deliberately NOT offered here (the direct
    // tag search keeps it, clearly labeled approximate).
    // The (LOWER(...) || '') wrapper makes every filter non-indexable ON
    // PURPOSE: combined with the LATERAL below, the planner has exactly one
    // plan — probe each friend's rows via the contactId btrees and filter in
    // memory — whose cost is bounded by the friend set and IDENTICAL for
    // every term. No term can be the next gita.
    // $3..$(2+n) = word-start regexes, $(3+n) = blocked phones
    const n = terms.length;
    const regexTerms = terms.map(toWordStartPattern);
    const tagConds = terms.map((_, i) => `(LOWER(ut.tag) || '') ~ $${i + 3}`).join(' OR ');
    const aliasConds = terms.map((_, i) => `(LOWER(ua_m.alias) || '') ~ $${i + 3}`).join(' OR ');
    const blockParamIdx = 3 + n;
    // userId again, as its own parameter: $1 is inferred as int (contactId
    // joins) while contact_facts.submitted_by_user_id is TEXT in prod — one
    // parameter cannot carry both types.
    const factsUserIdx = blockParamIdx + 1;

    // Rank FIRST, decorate LAST: the old shape joined the display tables
    // (8.4M-row UserAlias among them) onto EVERY match before the LIMIT — a
    // broad term (~45k matched contacts) turned that into full-table hash
    // joins and a statement timeout. The ranking core (mutuals − weak ties,
    // warmth) is cheap and picks the top rows; names and fields are resolved
    // for those rows only.
    const result = await query<{
      phone: string;
      target_user_id: number | null;
      name: string | null;
      via_names: string[] | null;
      employer: string | null;
      jobPosition: string | null;
      warmth: number | null;
    }>(
      `WITH friend_users AS (
         SELECT up."userId", up.phone AS via_phone
         FROM "UserPhone" up
         WHERE up.phone = ANY($2)
       ),
       tag_hits AS (
         SELECT t.phone, t."contactId"
         FROM friend_users fu
         JOIN LATERAL (
           SELECT ut.phone, ut."contactId"
           FROM "UserTags" ut
           WHERE ut."contactId" = fu."userId"
             AND (${tagConds})
         ) t ON TRUE
       ),
       alias_hits AS (
         SELECT a.phone, a."contactId"
         FROM friend_users fu
         JOIN LATERAL (
           SELECT ua_m.phone, ua_m."contactId"
           FROM "UserAlias" ua_m
           WHERE ua_m."contactId" = fu."userId"
             AND (${aliasConds})
         ) a ON TRUE
       ),
       matches AS (
         SELECT phone, "contactId" FROM tag_hits
         UNION
         SELECT phone, "contactId" FROM alias_hits
       ),
       ranked AS (
         SELECT m.phone,
                (COUNT(DISTINCT fu."userId") - COUNT(DISTINCT w.user_id)) AS bridge_rank,
                MAX(crs.strength_score)                                   AS warmth
         FROM matches m
         JOIN friend_users fu         ON fu."userId" = m."contactId"
         LEFT JOIN "UserAlias" ua_own ON ua_own.phone = m.phone AND ua_own."contactId" = $1
         LEFT JOIN weak_tie_signals w ON w.contact_phone = m.phone AND w.user_id = fu."userId"
         LEFT JOIN contact_relationship_scores crs
                ON crs.user_id = fu."userId" AND crs.contact_phone = m.phone
         WHERE ua_own.phone IS NULL
           AND m.phone != ALL($${blockParamIdx})
         GROUP BY m.phone
         ORDER BY (COUNT(DISTINCT fu."userId") - COUNT(DISTINCT w.user_id)) DESC,
                  MAX(crs.strength_score) DESC NULLS LAST,
                  m.phone
         LIMIT ${SECOND_DEGREE_RESULT_LIMIT}
       )
       SELECT r.phone,
              MAX(up_t."userId")                                               AS target_user_id,
              COALESCE(MAX(u_t.name), MAX(ua_t.alias))                        AS name,
              array_agg(DISTINCT COALESCE(ua_via.alias, u_via.name))
                FILTER (WHERE COALESCE(ua_via.alias, u_via.name) IS NOT NULL) AS via_names,
              COALESCE(MAX(NULLIF(TRIM(u_t.employer), '')),       MAX(fe.val)) AS employer,
              COALESCE(MAX(NULLIF(TRIM(u_t."jobPosition"), '')),  MAX(fj.val)) AS "jobPosition",
              -- via_warmth v2 (task 55, founder pulled it forward): the flat
              -- 0.4 was the unscored-edge baseline. Real signals now blend in,
              -- computed only for the LIMITed page: the bridge's relationship
              -- score, how much the bridge actually SAVED about the target
              -- (tags), whether they submitted facts, and — the strongest —
              -- whether an ask between them was ever ANSWERED.
              MAX(LEAST(0.95, GREATEST(
                COALESCE(r.warmth, 0.3),
                0.3
                + 0.05 * LEAST((SELECT COUNT(*) FROM "UserTags" t2
                                WHERE t2."contactId" = fu."userId" AND t2.phone = r.phone), 4)
                + CASE WHEN EXISTS (SELECT 1 FROM contact_facts cf2
                                    WHERE cf2.submitted_by_user_id = fu."userId"::text
                                      AND cf2.neo4j_contact_id = r.phone
                                      AND cf2.retracted_at IS NULL)
                       THEN 0.1 ELSE 0 END
                + CASE WHEN up_t."userId" IS NOT NULL AND EXISTS (
                        SELECT 1 FROM task_asks ta
                        WHERE ta.status = 'answered'
                          -- task_asks.from_user_id/to_user_id are INTEGER in prod (verified via
                          -- information_schema) — unlike contact_facts.submitted_by_user_id
                          -- (TEXT), which the ::text cast above was correctly modeled on. Applying
                          -- that same cast here compared an INTEGER column to a TEXT value on
                          -- every row and broke search_second_degree entirely (P0, 23 Aug — every
                          -- call failed with "operator does not exist: integer = text").
                          AND ((ta.from_user_id = fu."userId" AND ta.to_user_id = up_t."userId")
                            OR (ta.from_user_id = up_t."userId" AND ta.to_user_id = fu."userId")))
                       THEN 0.2 ELSE 0 END
              )))                                                              AS warmth
       FROM ranked r
       JOIN matches m               ON m.phone     = r.phone
       JOIN friend_users fu         ON fu."userId" = m."contactId"
       LEFT JOIN "UserAlias" ua_t   ON ua_t.phone  = r.phone AND ua_t."contactId" = m."contactId"
       LEFT JOIN "UserPhone"  up_t  ON up_t.phone  = r.phone
       LEFT JOIN "User"       u_t   ON u_t.id      = up_t."userId"
       LEFT JOIN "UserAlias" ua_via ON ua_via.phone = fu.via_phone AND ua_via."contactId" = $1
       LEFT JOIN "User"      u_via  ON u_via.id     = fu."userId"
       -- Role data (ticket 6 close §8): the User self-profile is almost always
       -- empty, so employer/jobPosition came back null for everyone — role
       -- searches were impossible. Facts are the real source, privacy-scoped:
       -- only PUBLIC (2+ confirmations) facts or the SEARCHER'S OWN. Empty
       -- strings count as missing (§10).
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(COALESCE(cf.canonical_value, cf.value)), '') AS val
         FROM contact_facts cf
         WHERE cf.neo4j_contact_id = r.phone AND cf.field_type = 'employer'
           AND cf.retracted_at IS NULL
           AND (cf.is_public OR cf.submitted_by_user_id = $${factsUserIdx})
         ORDER BY cf.is_public DESC, cf.updated_at DESC
         LIMIT 1
       ) fe ON TRUE
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(COALESCE(cf.canonical_value, cf.value)), '') AS val
         FROM contact_facts cf
         WHERE cf.neo4j_contact_id = r.phone AND cf.field_type = 'occupation'
           AND cf.retracted_at IS NULL
           AND (cf.is_public OR cf.submitted_by_user_id = $${factsUserIdx})
         ORDER BY cf.is_public DESC, cf.updated_at DESC
         LIMIT 1
       ) fj ON TRUE
       GROUP BY r.phone, r.bridge_rank, r.warmth
       ORDER BY r.bridge_rank DESC, r.warmth DESC NULLS LAST,
                MAX(COALESCE(u_t.name, ua_t.alias))
       LIMIT ${SECOND_DEGREE_RESULT_LIMIT}`,
      [userId, friendPhones, ...regexTerms, blockedPhones, userId],
      SECOND_DEGREE_QUERY_TIMEOUT_MS,
    );

    const rows = result.rows.filter((r) => !isExcluded(r.phone));
    if (rows.length === 0) return { found: false, reason: 'no_matches' };

    // The user's own "not this person, for this" decisions ride along here
    // too — Beso Ortoidze was excluded for intros and re-offered 40 minutes
    // later precisely because only the DIRECT tools carried exclusions.
    const [exclusions, signalStrength] = await Promise.all([
      fetchExclusionsForPhones(
        userId,
        rows.map((r) => r.phone),
      ),
      fetchSignalStrength(
        rows.map((r) => r.phone),
        regexTerms,
      ),
    ]);

    return {
      found: true,
      count: rows.length,
      results: rows.map((row) => ({
        phone: row.phone,
        name: row.name ?? null,
        employer: row.employer ?? null,
        jobPosition: row.jobPosition ?? null,
        ownership: OWNERSHIP.SECOND_DEGREE,
        // Consistent with the direct-search tools: every person-shaped result
        // carries is_member. Here a registered target is exactly one with a
        // resolved "UserPhone" row (target_user_id).
        is_member: row.target_user_id != null,
        via: row.via_names ?? [],
        // Strongest bridge→target relationship score (enrichment-computed,
        // 0..1) — how warm the best via's own tie to this person is. Missing
        // when no bridge has a computed score.
        ...(row.warmth != null && { via_warmth: Number(row.warmth) }),
        // T15: how well this person matches the query, from every tag/fact on
        // them — public or not. Never the matched word itself, only the
        // score. Missing when nothing (public or private) matched at all.
        ...(signalStrength.has(row.phone) && {
          signal_strength: signalStrength.get(row.phone),
        }),
        ...((exclusions.get(phoneDigits(row.phone))?.length ?? 0) > 0 && {
          exclusions: exclusions.get(phoneDigits(row.phone)),
        }),
        // Internal identifiers for agent use — never displayed to the user.
        // target_user_id is set when the person is a registered Ally user;
        // target_phone is set when they are not (unregistered contact).
        ...(row.target_user_id != null
          ? { target_user_id: row.target_user_id }
          : { target_phone: row.phone }),
      })),
    };
  } catch (err) {
    console.error('searchSecondDegree error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
