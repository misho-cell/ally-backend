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
  /** The thread carries no goal, or its goal is already closed. */
  NoOpenGoal = 'no_open_goal',
  /** No such thread, or not the caller's. */
  NotFound = 'not_found',
}

export interface GoalResolved {
  readonly outcome: ResolveOutcome.Resolved;
  readonly goal_id: number;
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

/** The owner's „მოგვარდა" on the goal of their own thread. */
export async function resolveGoalOnThread(
  userId: string,
  threadId: number,
): Promise<ResolveResult> {
  if ((await getThread(threadId, userId)) === null) return { outcome: ResolveOutcome.NotFound };
  const goal = await getGoalOnThread(threadId);
  if (goal === null || !canBeResolved(goal.status)) {
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
  return {
    outcome: ResolveOutcome.Resolved,
    goal_id: goal.id,
    open_questions: openQuestions,
    thread: await getThread(threadId, userId),
  };
}
