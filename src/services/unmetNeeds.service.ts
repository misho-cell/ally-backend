import { query } from '../db/postgres/client';

const UNMET_NEEDS_QUERY_TIMEOUT_MS = 8_000;

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

export interface UnmetNeedCandidate {
  phone: string;
  label: string;
  source: 'tag' | 'alias';
}

export interface UnmetNeed {
  query: string;
  ask_count: number;
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
  );
}

/**
 * Non-member candidates whose crowd tag or phonebook alias matches this
 * topic's words. Uses the pg_trgm `%` operator (not the similarity()
 * function) specifically because it — and only it — is recognized by the
 * planner as index-backed against idx_user_tags_norm_trgm /
 * idx_user_alias_norm_trgm; calling similarity() directly in a WHERE clause
 * forced a multi-million-row parallel seq scan in EXPLAIN against prod.
 */
async function candidatesForTopic(topic: string): Promise<UnmetNeedCandidate[]> {
  const words = significantWords(topic);
  const found = new Map<string, UnmetNeedCandidate>();
  for (const word of words) {
    if (found.size >= CANDIDATE_LIMIT_PER_TOPIC) break;
    const [tagRows, aliasRows] = await Promise.all([
      query<{ phone: string; tag: string }>(
        `SELECT t.phone, t.tag
         FROM "UserTags" t
         WHERE normalize_search_token(t.tag) % normalize_search_token($1)
           AND NOT EXISTS (SELECT 1 FROM "UserPhone" up WHERE up.phone = t.phone)
         LIMIT $2`,
        [word, CANDIDATE_LIMIT_PER_TOPIC],
        UNMET_NEEDS_QUERY_TIMEOUT_MS,
      ),
      query<{ phone: string; alias: string }>(
        `SELECT a.phone, a.alias
         FROM "UserAlias" a
         WHERE normalize_search_token(a.alias) % normalize_search_token($1)
           AND NOT EXISTS (SELECT 1 FROM "UserPhone" up WHERE up.phone = a.phone)
         LIMIT $2`,
        [word, CANDIDATE_LIMIT_PER_TOPIC],
        UNMET_NEEDS_QUERY_TIMEOUT_MS,
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
  }
  return Array.from(found.values()).slice(0, CANDIDATE_LIMIT_PER_TOPIC);
}

/**
 * "Which needs went unmet this month, and which non-users would have
 * answered them" — T6's own done-when query, one topic at a time so no
 * single request scans unboundedly regardless of how search volume grows.
 */
export async function findUnmetNeeds(sinceDays: number): Promise<UnmetNeed[]> {
  const failedSearches = await query<{ query: string; ask_count: string; city: string | null }>(
    `SELECT sa.query, COUNT(*) AS ask_count, MAX(u.city) AS city
     FROM search_activity sa
     LEFT JOIN "User" u ON u.id::text = sa.user_id
     WHERE sa.outcome = 'no_result' AND sa.created_at > NOW() - make_interval(days => $1::int)
     GROUP BY sa.query
     ORDER BY COUNT(*) DESC
     LIMIT ${TOPIC_LIMIT}`,
    [sinceDays],
    UNMET_NEEDS_QUERY_TIMEOUT_MS,
  );

  const results: UnmetNeed[] = [];
  for (const row of failedSearches.rows) {
    results.push({
      query: row.query,
      ask_count: Number(row.ask_count),
      city: row.city,
      candidates: await candidatesForTopic(row.query),
    });
  }
  return results;
}
