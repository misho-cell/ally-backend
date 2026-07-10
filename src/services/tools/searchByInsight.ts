import { query } from '../../db/postgres/client';
import { getExcludedPhoneSet } from '../block.service';
import { normalizePhone } from '../phone';
import { fetchMembersForPhones, isMemberPhone } from './membership';

const RESULT_LIMIT = 20;
const SEARCH_TIMEOUT_MS = 12_000;
const MIN_WORD_LEN = 2;
const MAX_QUERY_WORDS = 6;

interface InsightHit {
  name: string | null;
  matched: string[];
  info: Record<string, unknown> | null;
  contact_id: string;
}

interface FactRow {
  phone: string;
  name: string | null;
  matched: string[];
}

// Every fact query anchors on a single column per bound parameter.
// contact_facts.submitted_by_user_id is TEXT on prod while "UserAlias"."contactId"
// is INTEGER, so the SAME $1 can never be compared to both in one statement
// (Postgres cannot deduce one type for the parameter and the whole query throws
// on every call). The own- and public-fact paths are therefore split into two
// queries, each also runs in isolation so a slow public scan can't hide the
// user's own freshly-saved fact — the save→search loop.
const FACT_MATCH_AGG = `array_agg(DISTINCT cf.field_type || ': ' || COALESCE(cf.canonical_value, cf.value))`;

/**
 * A multi-word query matches per word (OR), not as one contiguous phrase, so
 * "იურისტი უძრავი ქონება" reaches a contact whose facts say only "უძრავი ქონება".
 * Words shorter than MIN_WORD_LEN are dropped as noise; a query that has none
 * (e.g. all short) falls back to the whole trimmed string as one term.
 */
function queryWords(searchQuery: string): string[] {
  const words = searchQuery
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= MIN_WORD_LEN)
    .slice(0, MAX_QUERY_WORDS);
  if (words.length > 0) return words;
  const whole = searchQuery.trim().toLowerCase();
  return whole ? [whole] : [];
}

/** `expr LIKE $n OR expr LIKE $n+1 ...` for `count` terms starting at `startIdx`. */
function likeOrClause(expr: string, count: number, startIdx: number): string {
  return Array.from({ length: count }, (_, i) => `${expr} LIKE $${startIdx + i}`).join(' OR ');
}

/**
 * Facts THIS user saved. Restricted by submitted_by_user_id first (indexed),
 * so the LIKE runs over just this user's handful of facts — fast, and the path
 * that must always succeed for the save→search memory loop.
 */
async function searchOwnFacts(userId: string, likes: string[]): Promise<FactRow[]> {
  const orClause = likeOrClause('LOWER(COALESCE(cf.canonical_value, cf.value))', likes.length, 3);
  const result = await query<FactRow>(
    `SELECT cf.neo4j_contact_id AS phone,
            COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
            ${FACT_MATCH_AGG} AS matched
     FROM contact_facts cf
     LEFT JOIN "UserAlias" ua ON ua.phone = cf.neo4j_contact_id AND ua."contactId" = $2
     LEFT JOIN "UserPhone" up ON up.phone = cf.neo4j_contact_id
     LEFT JOIN "User"      u  ON u.id     = up."userId"
     WHERE cf.submitted_by_user_id = $1
       AND (${orClause})
     GROUP BY cf.neo4j_contact_id
     LIMIT $${likes.length + 3}`,
    [userId, userId, ...likes, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Crowd-corroborated public facts, but only on contacts this user actually has.
 * Joining "UserAlias" on "contactId" first narrows the scan to this user's own
 * contacts before the LIKE, and keeps $1 bound to a single column type.
 */
async function searchPublicFacts(userId: string, likes: string[]): Promise<FactRow[]> {
  const orClause = likeOrClause('LOWER(COALESCE(cf.canonical_value, cf.value))', likes.length, 2);
  const result = await query<FactRow>(
    `SELECT cf.neo4j_contact_id AS phone,
            MAX(ua.alias) AS name,
            ${FACT_MATCH_AGG} AS matched
     FROM contact_facts cf
     JOIN "UserAlias" ua ON ua.phone = cf.neo4j_contact_id AND ua."contactId" = $1
     WHERE cf.is_public = true
       AND (${orClause})
     GROUP BY cf.neo4j_contact_id
     LIMIT $${likes.length + 2}`,
    [userId, ...likes, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

async function searchInsights(
  likes: string[],
): Promise<
  { neo4j_contact_id: string; neo4j_contact_name: string | null; data: Record<string, unknown> }[]
> {
  const perWord = Array.from(
    { length: likes.length },
    (_, i) => `(LOWER(neo4j_contact_name) LIKE $${i + 1} OR LOWER(data::text) LIKE $${i + 1})`,
  ).join(' OR ');
  const result = await query<{
    neo4j_contact_id: string;
    neo4j_contact_name: string | null;
    data: Record<string, unknown>;
  }>(
    `SELECT neo4j_contact_id, neo4j_contact_name, data
     FROM contact_insights
     WHERE ${perWord}
     ORDER BY updated_at DESC
     LIMIT $${likes.length + 1}`,
    [...likes, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

function settled<T>(result: PromiseSettledResult<T[]>, label: string): T[] {
  if (result.status === 'fulfilled') return result.value;
  console.error(`searchByInsight ${label} query failed:`, (result.reason as Error).message);
  return [];
}

/** How many distinct query words appear anywhere in a hit — the ranking key. */
function wordsHit(hit: InsightHit, words: string[]): number {
  const haystack = [hit.name ?? '', ...hit.matched, hit.info ? JSON.stringify(hit.info) : '']
    .join(' ')
    .toLowerCase();
  return words.filter((w) => haystack.includes(w)).length;
}

/**
 * Concept/fact search across everything saved about a contact:
 *   1. contact_facts — the user's own saved facts (the save→search loop) plus
 *      crowd-confirmed public facts on their contacts. This is where "who is a
 *      lawyer", "employer MKD Law" actually live.
 *   2. contact_insights — AI enrichment data.
 * Multi-word queries match per word (OR); results are then ranked by how many
 * of those words they hit, so a contact matching every word outranks one that
 * matched a single common word. All three sources run in isolation and are
 * merged by phone so one person appears once; a failure in any one source never
 * takes the others down.
 */
export async function searchByInsight(userId: string, searchQuery: string): Promise<object> {
  try {
    const words = queryWords(searchQuery);
    if (words.length === 0) return { found: false, query: searchQuery };
    const likes = words.map((w) => `%${w}%`);

    const [ownSettled, publicSettled, insightSettled, excluded] = await Promise.all([
      Promise.allSettled([searchOwnFacts(userId, likes)]).then((r) => r[0]),
      Promise.allSettled([searchPublicFacts(userId, likes)]).then((r) => r[0]),
      Promise.allSettled([searchInsights(likes)]).then((r) => r[0]),
      getExcludedPhoneSet(userId),
    ]);

    const factRows = [
      ...settled(ownSettled, 'own facts'),
      ...settled(publicSettled, 'public facts'),
    ];
    const insightRows = settled(insightSettled, 'insights');

    // Merge by normalized phone; facts win on name, insights fill the info blob.
    const byPhone = new Map<string, InsightHit>();
    for (const row of factRows) {
      const key = normalizePhone(row.phone);
      if (excluded.has(key)) continue;
      const matched = (row.matched ?? []).filter(Boolean);
      const existing = byPhone.get(key);
      if (existing) {
        existing.name = existing.name ?? row.name ?? null;
        existing.matched = [...new Set([...existing.matched, ...matched])];
      } else {
        byPhone.set(key, { name: row.name ?? null, matched, info: null, contact_id: row.phone });
      }
    }
    for (const row of insightRows) {
      const key = normalizePhone(row.neo4j_contact_id);
      if (excluded.has(key)) continue;
      const existing = byPhone.get(key);
      if (existing) {
        existing.info = row.data;
        existing.name = existing.name ?? row.neo4j_contact_name ?? null;
      } else {
        byPhone.set(key, {
          name: row.neo4j_contact_name ?? null,
          matched: [],
          info: row.data,
          contact_id: row.neo4j_contact_id,
        });
      }
    }

    // Best matches first: most query words hit wins.
    const ranked = [...byPhone.values()].sort((a, b) => wordsHit(b, words) - wordsHit(a, words));
    if (ranked.length === 0) return { found: false, query: searchQuery };

    const members = await fetchMembersForPhones(ranked.map((r) => r.contact_id));
    const results = ranked.map((r) => ({ ...r, is_member: isMemberPhone(members, r.contact_id) }));

    return { found: true, count: results.length, results };
  } catch (err) {
    console.error('searchByInsight error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
