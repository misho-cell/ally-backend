import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';

const UNMET_NEEDS_QUERY_TIMEOUT_MS = 8_000;
// A single word's candidate lookup measured ~1s on prod (strict-word-
// similarity bitmap over the 8.4M-row trigram index) — a slow word skips
// rather than stalling the whole report.
const CANDIDATE_QUERY_TIMEOUT_MS = 3_000;

// T6 part (b): "failed topics are matched against non-user profiles to
// compute who WOULD have answered them." Part (a) — the outcome ladder
// itself — already tags every search 'no_result' when nothing was accepted.
// This is the second half: for those failed searches, who OUTSIDE the
// network (no UserPhone row) carries a matching crowd tag or phonebook
// label, and would therefore have been a real answer had they been a member.

// A failed-search run processes at most this many distinct topics — at
// today's volume (dozens/month) this is generous headroom, not a real cap;
// it exists so a future volume spike can't turn one report into an unbounded
// scan.
const TOPIC_LIMIT = 50;
const CANDIDATE_LIMIT_PER_TOPIC = 10;
// Below this length a word is noise ("a", "და", "the") rather than a topic —
// matching it against millions of tags would return everything and nothing.
const MIN_WORD_LENGTH = 3;
// Ticket 7 Task 4 item 2: candidate search costs ~1s per word on prod, so a
// topic probes only its first few significant words — candidates almost
// always fill from the first one.
const WORDS_PER_TOPIC = 3;

export type DemandSource = 'netai' | 'old_ally';

export interface UnmetNeedCandidate {
  phone: string;
  label: string;
  source: 'tag' | 'alias';
}

export interface UnmetNeed {
  query: string;
  ask_count: number;
  // Ticket 7 Task 4 item 4: where the demand came from, so T5's merge of
  // old-Ally SearchHistory into this list is visible per topic.
  sources: Record<DemandSource, number>;
  // The closest available proxy for "market": no non-user has a reliable
  // location of their own, so this is the ASKER's own city, not the
  // candidate's — documented here rather than silently implied to be more
  // than it is.
  city: string | null;
  candidates: UnmetNeedCandidate[];
}

function significantWords(topic: string): string[] {
  return Array.from(
    new Set(
      topic
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= MIN_WORD_LENGTH),
    ),
  ).slice(0, WORDS_PER_TOPIC);
}

/**
 * Ticket 7 Task 4 item 3: searches made by the review/test accounts
 * (REVIEW_PHONE env, the same list auth's OTP bypass uses) must not feed
 * demand data. Resolved to user ids at call time so the env var stays the
 * single source of truth. Honest limit: connector test runs made on a REAL
 * account's own token (the founder's) are indistinguishable from his real
 * searches and are not filtered.
 */
async function testAccountUserIds(): Promise<number[]> {
  const digits = (process.env.REVIEW_PHONE ?? '')
    .split(',')
    .map((p) => phoneDigits(p.trim()))
    .filter(Boolean);
  if (digits.length === 0) return [];
  const result = await query<{ userId: number }>(
    `SELECT "userId" FROM "UserPhone"
     WHERE regexp_replace(phone, '\\D', '', 'g') = ANY($1)`,
    [digits],
    UNMET_NEEDS_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.userId);
}

/**
 * Non-member candidates whose crowd tag or phonebook alias matches this
 * topic's words. Ticket 7 Task 4 item 2 (the Germany fix, applied here): a
 * candidate matches only when a WHOLE label token equals the topic word
 * after normalize_search_token folding (which already covers the known
 * spelling variants: script + gh/kh/zh/ts/q/x drift) — never a prefix,
 * never a letter-similar fragment. The pg_trgm `<<%` (strict word
 * similarity) operator is the index-backed prefilter — verified via EXPLAIN
 * ANALYZE on prod against idx_user_tags_norm_trgm / idx_user_alias_norm_trgm
 * — and the exact-token ANY(regexp_split_to_array(...)) is the precision
 * gate that killed the "ვეტერინარი"→eteri / "business"→bus / "energy"→
 * synergy class. Labels with no letters (bare number fragments saved as
 * names) are never candidates. ORDER BY phone makes every read deterministic.
 */
async function candidatesForTopic(topic: string): Promise<UnmetNeedCandidate[]> {
  const words = significantWords(topic);
  const found = new Map<string, UnmetNeedCandidate>();
  for (const word of words) {
    if (found.size >= CANDIDATE_LIMIT_PER_TOPIC) break;
    try {
      const [tagRows, aliasRows] = await Promise.all([
        query<{ phone: string; tag: string }>(
          `SELECT t.phone, t.tag
           FROM "UserTags" t
           WHERE normalize_search_token($1) <<% normalize_search_token(t.tag)
             AND normalize_search_token($1) = ANY(
               regexp_split_to_array(normalize_search_token(t.tag), '[^a-z0-9]+'))
             AND t.tag ~ '[a-zა-ჿ]'
             AND NOT EXISTS (SELECT 1 FROM "UserPhone" up WHERE up.phone = t.phone)
           ORDER BY t.phone
           LIMIT $2`,
          [word, CANDIDATE_LIMIT_PER_TOPIC],
          CANDIDATE_QUERY_TIMEOUT_MS,
        ),
        query<{ phone: string; alias: string }>(
          `SELECT a.phone, a.alias
           FROM "UserAlias" a
           WHERE normalize_search_token($1) <<% normalize_search_token(a.alias)
             AND normalize_search_token($1) = ANY(
               regexp_split_to_array(normalize_search_token(a.alias), '[^a-z0-9]+'))
             AND a.alias ~ '[a-zა-ჿ]'
             AND NOT EXISTS (SELECT 1 FROM "UserPhone" up WHERE up.phone = a.phone)
           ORDER BY a.phone
           LIMIT $2`,
          [word, CANDIDATE_LIMIT_PER_TOPIC],
          CANDIDATE_QUERY_TIMEOUT_MS,
        ),
      ]);
      for (const row of tagRows.rows) {
        if (!found.has(row.phone))
          found.set(row.phone, { phone: row.phone, label: row.tag, source: 'tag' });
      }
      for (const row of aliasRows.rows) {
        if (!found.has(row.phone))
          found.set(row.phone, { phone: row.phone, label: row.alias, source: 'alias' });
      }
    } catch {
      // A slow word (statement timeout under load) degrades this word only.
    }
  }
  return Array.from(found.values()).slice(0, CANDIDATE_LIMIT_PER_TOPIC);
}

/**
 * "Which needs went unmet this month, and which non-users would have
 * answered them" — T6's own done-when query. Merges Netai's search_activity
 * with old-Ally's still-live SearchHistory (T5's done-when), keeps the
 * per-source counts visible (Task 4 item 4), skips topics that are bare
 * phone-number lookups (a number search is not an occupation need), and
 * excludes the review/test accounts' searches (Task 4 item 3).
 */
export async function findUnmetNeeds(sinceDays: number): Promise<UnmetNeed[]> {
  const testIds = await testAccountUserIds();
  const failedSearches = await query<{
    query: string;
    netai_count: string;
    old_ally_count: string;
    city: string | null;
  }>(
    `SELECT query,
            SUM(cnt) FILTER (WHERE src = 'netai') AS netai_count,
            SUM(cnt) FILTER (WHERE src = 'old_ally') AS old_ally_count,
            MAX(city) AS city
     FROM (
       SELECT sa.query AS query, 'netai' AS src, COUNT(*) AS cnt, MAX(u.city) AS city
       FROM search_activity sa
       LEFT JOIN "User" u ON u.id::text = sa.user_id
       WHERE sa.outcome = 'no_result'
         AND sa.created_at > NOW() - make_interval(days => $1::int)
         AND sa.query ~ '[a-zა-ჿA-Z]'
         AND sa.user_id != ALL($2::text[])
       GROUP BY sa.query
       UNION ALL
       SELECT sh."searchQuery" AS query, 'old_ally' AS src, COUNT(*) AS cnt, MAX(u.city) AS city
       FROM "SearchHistory" sh
       JOIN "User" u ON u.id = sh."originUserId"
       WHERE sh."foundExactMatch" = false
         AND sh."createdAt" > NOW() - make_interval(days => $1::int)
         AND sh."searchQuery" ~ '[a-zა-ჿA-Z]'
         AND sh."originUserId" != ALL($3::int[])
       GROUP BY sh."searchQuery"
     ) combined
     GROUP BY query
     ORDER BY SUM(cnt) DESC, query ASC
     LIMIT ${TOPIC_LIMIT}`,
    [sinceDays, testIds.map(String), testIds],
    UNMET_NEEDS_QUERY_TIMEOUT_MS,
  );

  const results: UnmetNeed[] = [];
  for (const row of failedSearches.rows) {
    const netai = Number(row.netai_count ?? 0);
    const oldAlly = Number(row.old_ally_count ?? 0);
    results.push({
      query: row.query,
      ask_count: netai + oldAlly,
      sources: { netai, old_ally: oldAlly },
      city: row.city,
      candidates: await candidatesForTopic(row.query),
    });
  }
  return results;
}
