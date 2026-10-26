import { query } from '../db/postgres/client';
import { wakeTask } from './taskEngine.service';
import { WakeOrigin } from './quietWakeGuard';

/**
 * #7825 (founder 26 Oct; Korneli, thread 64696): the person answered a Netai
 * message about his goal („ვკითხოთ" under „ask Levan?") in the Netai chat,
 * where no model runs — and the goal heard nothing for 28 hours. A message
 * sent with its goal now hands the answer to that goal's next run.
 *
 * MODEL-FACING: the wake text below is new text the run reads. It shipped OFF
 * and went ON on 26 Oct under Misho's standing rule (build what the row does
 * not leave to him).
 */
export const NETAI_REPLY_WAKES_GOAL = true;

const LOOKUP_TIMEOUT_MS = 3_000;

const WAKE_TEXT =
  'The owner answered a message Netai sent him about this goal. The message: «%MESSAGE%». ' +
  'His answer: «%ANSWER%». Act on his answer now, as if he had written it in this chat.';

/** The open goal the person's latest Netai message in this chat was about, or null. */
export async function goalOfLatestNetaiMessage(
  threadId: number,
  userId: number,
): Promise<{ readonly taskId: number; readonly body: string } | null> {
  const result = await query<{ task_id: number; body: string }>(
    `SELECT m.task_id, m.body FROM netai_messages m
       JOIN tasks t ON t.id = m.task_id AND t.status = 'open' AND t.user_id = m.user_id::text
      WHERE m.thread_id = $1 AND m.user_id = $2
      ORDER BY m.sent_at DESC
      LIMIT 1`,
    [threadId, userId],
    LOOKUP_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : { taskId: row.task_id, body: row.body };
}

export function netaiReplyWakeText(message: string, answer: string): string {
  // A function, so a „$&" the person typed is kept as typed, not read as a pattern.
  return WAKE_TEXT.replace('%MESSAGE%', () => message).replace('%ANSWER%', () => answer);
}

/** Best-effort; never throws. False when switched off, about no goal, or not woken. */
export async function wakeGoalWithNetaiReply(
  threadId: number,
  userId: number,
  answer: string,
  on: boolean = NETAI_REPLY_WAKES_GOAL,
): Promise<boolean> {
  if (!on) return false;
  try {
    const goal = await goalOfLatestNetaiMessage(threadId, userId);
    if (goal === null) return false;
    return (
      (await wakeTask(
        goal.taskId,
        netaiReplyWakeText(goal.body, answer),
        undefined,
        WakeOrigin.Owner,
      )) === 'woken'
    );
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error(
      `[netai-message] reply of ${userId} did not reach the goal:`,
      (err as Error).message,
    );
    return false;
  }
}
