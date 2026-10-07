import { query } from '../db/postgres/client';

/**
 * D713, phase 1 (the founder, 7 Oct; Misho's yes, item 2): the owner's first
 * ask on a goal is pinned on every turn. A long goal's later turns read the
 * newest lines, and what the owner asked for in the first place fell out of
 * view. The line the goal was opened from goes to the model with every run of
 * that goal, word for word, in the per-goal part of the prompt (it does not
 * change while the goal lives, so it stays cached).
 *
 * The line is the owner's last message at or before the goal was created —
 * the one the goal was opened from. Empty on any failure: the run goes on
 * without the pin, and the failure is logged.
 */
const QUERY_TIMEOUT_MS = 4_000;
const MAX_FIRST_ASK_CHARS = 600;

export async function goalFirstAsk(taskId: number): Promise<string> {
  try {
    const result = await query<{ content: string }>(
      `SELECT c.content FROM conversations c
         JOIN tasks t ON t.thread_id = c.thread_id
        WHERE t.id = $1 AND c.role = 'user' AND c.kind = 'message'
          AND TRIM(c.content) <> '' AND c.created_at <= t.created_at
        ORDER BY c.created_at DESC
        LIMIT 1`,
      [taskId],
      QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.content.trim() ?? '';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[goal-first-ask] task ${taskId}: not read:`, (err as Error).message);
    return '';
  }
}

/** The prompt section carrying the pinned line; '' when there is none. */
export function goalFirstAskSection(line: string): string {
  const said = line.trim().slice(0, MAX_FIRST_ASK_CHARS);
  if (said === '') return '';
  return (
    '\n\n## მფლობელის პირველი თხოვნა ამ მიზანზე (D713)\n' +
    `„${said}"\n` +
    'ეს არის ის, რაც მფლობელმა თავიდან ითხოვა. ყოველ ნაბიჯზე ამას ემსახურები: ვისაც წერ და ' +
    'რასაც ეკითხები, ამ თხოვნიდან უნდა გამომდინარეობდეს. თუ მფლობელმა მერე სხვა რამ თქვა, მისი ' +
    'ბოლო სიტყვა მოქმედებს — მაგრამ თავდაპირველი თხოვნა არ დაკარგო.'
  );
}
