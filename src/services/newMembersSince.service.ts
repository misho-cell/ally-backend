import { query } from '../db/postgres/client';
import { exactMatchesWithPhones } from './tools/searchByTag';

/**
 * D651 (the founder, box 37654; the plan in box 37623): the quiet check-in
 * looks again as people join. Before a scheduled wake, the server reads the
 * owner's contacts who joined Netai since the goal last ran and whom the
 * goal's own search words find. A database read, no model. When there are
 * some, the wake names them and the run offers them in the plan; when there
 * are none, the check-in stays as quiet as before.
 *
 * „The goal's own search words" are what its runs already searched for in its
 * conversation (tool_call_log), so the words are the owner's need as the run
 * understood it, not a fresh guess. „Joined" is the person's first
 * conversation on Netai.
 */
const NEW_MEMBERS_TIMEOUT_MS = 4_000;
const MAX_SEARCH_WORDS = 5;
const MAX_NEW_MEMBERS = 5;
const SEARCH_TOOLS = ['search_by_tag', 'search_second_degree'];
const TAG_QUERY_RE = /tag_query=([^;,\n]+)/u;

/** The words this goal's runs searched for, newest first. */
export async function goalSearchWords(threadId: number): Promise<string[]> {
  const result = await query<{ args_summary: string | null }>(
    `SELECT args_summary FROM tool_call_log
      WHERE thread_id = $1 AND tool = ANY($2::text[]) AND args_summary IS NOT NULL
      ORDER BY id DESC
      LIMIT $3`,
    [threadId, SEARCH_TOOLS, MAX_SEARCH_WORDS * 4],
    NEW_MEMBERS_TIMEOUT_MS,
  );
  const words: string[] = [];
  for (const row of result.rows) {
    const word = TAG_QUERY_RE.exec(row.args_summary ?? '')?.[1]?.trim() ?? '';
    if (word !== '' && !words.includes(word)) words.push(word);
    if (words.length >= MAX_SEARCH_WORDS) break;
  }
  return words;
}

/** When the goal last answered in its conversation; null before its first answer. */
async function goalLastRanAt(threadId: number): Promise<string | null> {
  const result = await query<{ at: string | null }>(
    `SELECT MAX(created_at) AS at FROM conversations
      WHERE thread_id = $1 AND role = 'assistant' AND kind = 'message'`,
    [threadId],
    NEW_MEMBERS_TIMEOUT_MS,
  );
  return result.rows[0]?.at ?? null;
}

/** Of these numbers, the ones whose owner's first conversation came after `since`. */
async function joinedSince(phones: readonly string[], since: string): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const result = await query<{ phone: string }>(
    `SELECT up.phone FROM "UserPhone" up
       JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
      WHERE up.phone = ANY($1::text[])
        AND (SELECT MIN(t.created_at) FROM threads t WHERE t.user_id = u.id) > $2::timestamptz
      LIMIT $3`,
    [phones, since, MAX_NEW_MEMBERS * 4],
    NEW_MEMBERS_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.phone));
}

/** The owner's contacts the goal's words find who joined Netai since it last ran, by name. */
export async function membersJoinedSinceLastRun(
  ownerId: string,
  threadId: number,
): Promise<string[]> {
  const [since, words] = await Promise.all([goalLastRanAt(threadId), goalSearchWords(threadId)]);
  if (since === null || words.length === 0) return [];
  const found = new Map<string, string>();
  for (const word of words) {
    for (const match of await exactMatchesWithPhones(ownerId, word)) {
      if (match.name !== '' && !found.has(match.phone)) found.set(match.phone, match.name);
    }
  }
  const joined = await joinedSince([...found.keys()], since);
  return [...found.entries()]
    .filter(([phone]) => joined.has(phone))
    .map(([, name]) => name)
    .slice(0, MAX_NEW_MEMBERS);
}

/** What the wake tells the run about them. */
export function newMembersNote(names: readonly string[]): string {
  return (
    `[ახალი წევრები] ბოლო გაშვების შემდეგ Netai-ზე შემოვიდნენ მფლობელის კონტაქტები, რომლებსაც ` +
    `ამ მიზნის ძებნის სიტყვები პოულობს: ${names.join(', ')}. ისინი ახლა პირდაპირ შეიძლება ` +
    'ვკითხოთ: იპოვე search_contact_by_name-ით, შესთავაზე მფლობელს გეგმაში (people_to_involve) ' +
    'და დადე propose_task_plan-ით. გეგმის დამტკიცებამდე არავის მისწერო.'
  );
}
