import { query } from '../db/postgres/client';
import { queueFollowUp } from './pendingUpdates.service';
import { setThreadStatus } from './threadStatus.service';
import { saveThreadMessage } from './threads.service';
import { getTaskById } from './taskStore.service';

const QUERY_TIMEOUT_MS = 8_000;
// The pending item and the stored question carry the question itself, not the
// whole nightly essay — long enough for a real sentence, short enough to read.
const MAX_QUESTION_CHARS = 400;
export const GOAL_QUESTION_KIND = 'goal_question';

/**
 * Ticket 8 Task 2(a): the goal's blocking question, made visible.
 *
 * The nightly wake fires, the run finds people — and ends at a question inside
 * a thread the owner has not opened for days. The question itself must travel
 * to wherever the owner actually shows up next: it is stored on the task
 * (admin view + badge truth), and queued as a typed item into the ONE pending
 * list (T9) that every conversation start already reads, on both surfaces.
 *
 * Two writers: the model calls ask_owner_decision with the exact question when
 * it is blocked on the owner, and the engine's fallback flags a wake run whose
 * reply ended at a question the model forgot to register. One live question
 * per goal — a new one replaces the old, held item and stored text both.
 */
export async function flagGoalQuestion(
  userId: string,
  taskId: number,
  question: string,
): Promise<{ flagged: boolean; error?: string }> {
  const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!trimmed) return { flagged: false, error: 'Pass the question itself.' };
  return flagGoal(userId, taskId, trimmed);
}

/**
 * The engine's fallback: this run ended asking the owner something, but the
 * model never registered WHAT. The goal is flagged with no question text.
 *
 * It used to store the reply's closing paragraph instead. Live on 1 Sep the
 * nightly reply for goal 1420 (dog trainer) reported on three goals at once and
 * closed on the Batumi-photographer question — which was then filed as goal
 * 1420's own question. A question shown against the wrong goal is worse than no
 * question at all: the owner is told a goal is blocked on something it never
 * asked. Text now comes only from the model naming its own question through
 * ask_owner_decision; the fallback carries the badge and the goal's title, and
 * sends the owner to the thread to read it.
 */
export async function flagGoalNeedsOwner(
  userId: string,
  taskId: number,
): Promise<{ flagged: boolean; error?: string }> {
  return flagGoal(userId, taskId, null);
}

async function flagGoal(
  userId: string,
  taskId: number,
  question: string | null,
): Promise<{ flagged: boolean; error?: string }> {
  const task = await getTaskById(taskId);
  if (!task || task.user_id !== userId || task.status !== 'open') {
    return { flagged: false, error: 'No such open goal of yours.' };
  }

  // A fallback flag must not overwrite a question the model DID register on an
  // earlier run — that text is attributable, this one is not.
  await query(
    question === null
      ? `UPDATE tasks SET pending_question_at = NOW() WHERE id = $1 AND user_id = $2`
      : `UPDATE tasks SET pending_question = $3, pending_question_at = NOW()
         WHERE id = $1 AND user_id = $2`,
    question === null ? [taskId, userId] : [taskId, userId, question],
    QUERY_TIMEOUT_MS,
  );
  // One live question per goal: drop the previous held item before queueing.
  await query(
    `DELETE FROM pending_updates
     WHERE user_id = $1 AND task_id = $2 AND kind = $3 AND status = 'held'`,
    [userId, taskId, GOAL_QUESTION_KIND],
    QUERY_TIMEOUT_MS,
  );
  // The stored question may predate this flag (the model registered it on an
  // earlier run); the held item must carry whatever the goal actually holds.
  const carried = question ?? task.pending_question;
  await queueFollowUp(
    userId,
    taskId,
    GOAL_QUESTION_KIND,
    {
      task_id: taskId,
      goal_title: task.title,
      ...(carried !== null && { question: carried }),
      instruction:
        carried !== null
          ? `The goal "${task.title}" is blocked on the owner's answer. Ask them the question ` +
            'verbatim (translate if the conversation is in another language), get a real answer, ' +
            'then call answer_goal_question with task_id and what they said — that is what ' +
            'un-blocks the goal. If they defer, accept it and move on.'
          : `The goal "${task.title}" ended its last run waiting on the owner, but the question ` +
            'itself was never registered — you do NOT know what it is, so do not invent one. ' +
            'Tell them that goal is waiting on them and point them at its thread. If they say ' +
            'what they want, call answer_goal_question with task_id and their words.',
    },
    0,
  );
  // The badge tells the same story immediately (the run's own terminal status
  // will confirm it after the reply lands).
  if (task.thread_id !== null) {
    await setThreadStatus(userId, task.thread_id, 'needs_you', { isTask: true });
  }
  return { flagged: true };
}

/**
 * The owner's answer travels BACK to the goal: append it to the goal's thread
 * as an event and wake the task so it acts on it now. When the wake cannot run
 * (busy thread, exhausted wallet), the answer is still persisted into the
 * thread — the next scheduled wake reads it from history. Clears the stored
 * question either way: it has been answered.
 */
export async function answerGoalQuestion(
  userId: string,
  taskId: number,
  answer: string,
): Promise<{ delivered: boolean; error?: string }> {
  const trimmed = answer.trim();
  if (!trimmed) return { delivered: false, error: 'Pass the answer itself.' };
  const task = await getTaskById(taskId);
  if (!task || task.user_id !== userId || task.status !== 'open') {
    return { delivered: false, error: 'No such open goal of yours.' };
  }

  await clearGoalQuestion(taskId);
  const event =
    `მფლობელმა უპასუხა მიზნის კითხვას („${task.pending_question ?? '…'}"):\n` +
    `<answer>\n${trimmed}\n</answer>\n` +
    'იმოქმედე ამ პასუხის მიხედვით და განაახლე brief-ი.';

  // Dynamic import: taskEngine statically imports chat.service, which imports
  // this file — a static import back would be a load-order cycle (the same
  // shape as sendApprovedAskAnswer's wake).
  try {
    const { wakeTask } = await import('./taskEngine.service');
    const woken = await wakeTask(taskId, event);
    if (woken) return { delivered: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[goal-question] answer wake failed:', (err as Error).message);
  }
  // Fallback: persist the answer into the goal's thread so the next wake
  // (nightly at the latest) reads it from history. Delivered=true is honest:
  // the answer is in the goal's record.
  if (task.thread_id !== null) {
    await saveThreadMessage(task.thread_id, Number(userId), 'user', `[მოვლენა] ${event}`).catch(
      () => undefined,
    );
  }
  return { delivered: true };
}

/** Answered-by-showing-up: the owner wrote in the goal's own thread. */
export async function clearGoalQuestionForThread(userId: string, threadId: number): Promise<void> {
  const owned = await query<{ id: number }>(
    `UPDATE tasks SET pending_question = NULL, pending_question_at = NULL
     WHERE thread_id = $1 AND user_id = $2 AND status = 'open' AND pending_question IS NOT NULL
     RETURNING id`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  for (const row of owned.rows) {
    await query(
      `DELETE FROM pending_updates
       WHERE user_id = $1 AND task_id = $2 AND kind = $3 AND status = 'held'`,
      [userId, row.id, GOAL_QUESTION_KIND],
      QUERY_TIMEOUT_MS,
    );
  }
}

async function clearGoalQuestion(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET pending_question = NULL, pending_question_at = NULL WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  await query(
    `DELETE FROM pending_updates
     WHERE task_id = $1 AND kind = $2 AND status = 'held'`,
    [taskId, GOAL_QUESTION_KIND],
    QUERY_TIMEOUT_MS,
  );
}

/**
 * Did a run register a question during THIS run? The engine's terminal-status
 * calculation reads this instead of trusting punctuation alone.
 */
export async function goalQuestionFlaggedSince(taskId: number, since: Date): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT id FROM tasks WHERE id = $1 AND pending_question_at >= $2 LIMIT 1`,
    [taskId, since.toISOString()],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

export interface AdminGoalRow {
  id: number;
  title: string;
  status: string;
  brief: string | null;
  pending_question: string | null;
  pending_question_at: string | null;
  next_wake_at: string | null;
  thread_id: number | null;
  created_at: string;
  last_activity_at: string;
  wakes_delivered: number;
  asks_sent: number;
}

const ADMIN_GOALS_LIMIT = 50;

/**
 * Ticket 8 Task 2(c), Q-29: the admin read path for goals — per goal: the
 * brief, the next wake, how many wakes actually entered the thread, how many
 * asks went out, and the question the goal is blocked on right now.
 */
export async function adminListGoals(userId: string): Promise<AdminGoalRow[]> {
  const result = await query<AdminGoalRow>(
    `SELECT t.id, t.title, t.status, t.brief, t.pending_question, t.pending_question_at,
            t.next_wake_at, t.thread_id, t.created_at, t.last_activity_at,
            (SELECT COUNT(*)::int FROM conversations c
              WHERE c.thread_id = t.thread_id AND c.role = 'user'
                AND c.content LIKE '[მოვლენა]%') AS wakes_delivered,
            (SELECT COUNT(*)::int FROM task_asks ta WHERE ta.task_id = t.id) AS asks_sent
     FROM tasks t
     WHERE t.user_id = $1
     ORDER BY (t.status = 'open') DESC, t.last_activity_at DESC
     LIMIT $2`,
    [userId, ADMIN_GOALS_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
