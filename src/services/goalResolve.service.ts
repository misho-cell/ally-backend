import { query } from '../db/postgres/client';
import { cancelIntroductionRequestsForTask } from './introduction.service';
import { offerOpenAsksChoice } from './openAsksAfterSolved';
import { emitChoicesCleared } from './sse.service';
import { getGoalOnThread, updateTask } from './taskStore.service';
import { setThreadStatus } from './threadStatus.service';
import { clearStoredChoices, getThread, Thread } from './threads.service';

/**
 * 4925 (Giorgi, 13 Oct; the frontend's 11 Oct 16:55Z ask): the design's
 * „მოგვარდა" button. The owner's own tap is the owner's „solved" (row 147:
 * only the owner closes a goal as done), so the goal closes as finished here,
 * the same as finish_task after a confirmed yes, with no run and no new text.
 */
export enum ResolveOutcome {
  Resolved = 'resolved',
  /** The thread's goal is already closed. */
  NoOpenGoal = 'no_open_goal',
  /** No such thread, or not the caller's. */
  NotFound = 'not_found',
}

export interface GoalResolved {
  readonly outcome: ResolveOutcome.Resolved;
  /** Null for a chat that never carried a goal (#5282). */
  readonly goal_id: number | null;
  /** Questions still out; when above 0 the owner was shown the keep-or-close card (row 311). */
  readonly open_questions: number;
  readonly thread: Thread | null;
}

export type ResolveResult =
  | GoalResolved
  | { readonly outcome: ResolveOutcome.NoOpenGoal | ResolveOutcome.NotFound };

/** Kept in tasks.closed_reason; never shown to anybody. */
export const RESOLVED_BY_OWNER_NOTE = 'resolved_by_owner_button';

/** A goal that is open or paused can be called solved; a closed one cannot. */
function canBeResolved(status: string): boolean {
  return status === 'open' || status === 'paused';
}

/**
 * #5282 (founder rule D802): a chat with no goal stays open until its owner
 * calls it solved, so the button closes it too — the thread only, nothing else
 * to close.
 */
async function resolvePlainChat(userId: string, threadId: number): Promise<GoalResolved> {
  emitChoicesCleared(userId, threadId);
  await clearStoredChoices(threadId);
  await setThreadStatus(userId, threadId, 'done', { statusLine: null });
  return {
    outcome: ResolveOutcome.Resolved,
    goal_id: null,
    open_questions: 0,
    thread: await getThread(threadId, userId),
  };
}

/** The owner's „მოგვარდა" on the goal of their own thread. */
/**
 * #6363, RULE D588 (1) (Giorgi, 19 Oct): the owner's „მოგვარდა" moves the case
 * to „მოგვარებული" for everybody in it — each helper's question and each
 * go-between's introduction request — not only for the owner. Nothing is
 * deleted or hidden; each conversation keeps all it holds. Best-effort: the
 * owner's own case is resolved whatever happens here, and a miss is logged.
 */
const PARTICIPANT_THREADS_READ = 100;
const PARTICIPANT_QUERY_TIMEOUT_MS = 5_000;

async function settleParticipantThreads(goalId: number, ownerThreadId: number): Promise<void> {
  try {
    const result = await query<{ id: number; user_id: number }>(
      `SELECT th.id, th.user_id FROM threads th
        WHERE th.id <> $2
          AND th.status <> 'done'
          AND (th.id IN (SELECT ta.ask_thread_id FROM task_asks ta WHERE ta.task_id = $1)
               OR th.id IN (SELECT ir.mediator_thread_id FROM introduction_requests ir
                             WHERE ir.requester_task_id = $1)
               OR th.introduction_request_id IN (SELECT ir.id FROM introduction_requests ir
                                                  WHERE ir.requester_task_id = $1))
        LIMIT $3`,
      [goalId, ownerThreadId, PARTICIPANT_THREADS_READ],
      PARTICIPANT_QUERY_TIMEOUT_MS,
    );
    for (const thread of result.rows) {
      await setThreadStatus(String(thread.user_id), thread.id, 'done');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[resolve] goal ${goalId}: participants not settled:`, (err as Error).message);
  }
}

export async function resolveGoalOnThread(
  userId: string,
  threadId: number,
): Promise<ResolveResult> {
  if ((await getThread(threadId, userId)) === null) return { outcome: ResolveOutcome.NotFound };
  const goal = await getGoalOnThread(threadId);
  if (goal === null) return resolvePlainChat(userId, threadId);
  if (!canBeResolved(goal.status)) {
    return { outcome: ResolveOutcome.NoOpenGoal };
  }
  const closed = await updateTask(userId, goal.id, 'closed', RESOLVED_BY_OWNER_NOTE, 'finished');
  if (!closed) return { outcome: ResolveOutcome.NoOpenGoal };
  // A plan's approve button must not outlive its goal (row 113, the stop's same rule).
  emitChoicesCleared(userId, threadId);
  await clearStoredChoices(threadId);
  // After the buttons are cleared, so the keep-or-close card it may write stays.
  const openQuestions = await offerOpenAsksChoice(goal.id, threadId, Number(userId));
  await setThreadStatus(userId, threadId, 'done');
  // #6363 reopened (Giorgi, G-123): a go-between still holding the request read
  // the case as open after the owner's „მოგვარდა" — request 7327 stayed
  // pending. It is withdrawn, as a stop withdraws it, before the threads settle.
  // withdrawRequests catches and logs its own failure; the resolve goes on regardless.
  await cancelIntroductionRequestsForTask(goal.id);
  await settleParticipantThreads(goal.id, threadId);
  return {
    outcome: ResolveOutcome.Resolved,
    goal_id: goal.id,
    open_questions: openQuestions,
    thread: await getThread(threadId, userId),
  };
}
