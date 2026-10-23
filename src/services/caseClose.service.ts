import { query } from '../db/postgres/client';
import { settleParticipantThreads } from './goalResolve.service';
import { dismissStoppedGoal, stopGoal } from './goalStop.service';
import { pendingIntroInMediatorThread, resolveIntroductionRequest } from './introduction.service';
import { getGoalOnThread } from './taskStore.service';
import { setThreadStatus } from './threadStatus.service';
import { Thread } from './threads.service';

/**
 * #6363 (a), RULE D588 (Giorgi, 19–20 Oct; Misho's yes 20 Oct): „წაშლა" on a
 * CASE never erases it — nothing may disappear for anybody. The case moves to
 * „მოგვარებული" for everyone in it, with its whole conversation:
 *
 *   * the owner's goal stops (its open questions and requests are withdrawn,
 *     each person gets the same note a stop sends), is dismissed from the
 *     current list, and every helper's and go-between's thread settles;
 *   * a go-between's or helper's own thread settles, and a request still
 *     waiting in it is declined — „წაშლა" there means „no".
 *
 * A plain chat with nobody else in it is not a case: it is still erased, as
 * Lika's D23 and the Privacy Policy promise.
 */
export enum CaseCloseOutcome {
  Closed = 'closed',
  NotACase = 'not_a_case',
}

const CASE_QUERY_TIMEOUT_MS = 4_000;

/** True when anyone besides the owner is or was in this conversation's work. */
async function isACase(thread: Thread): Promise<boolean> {
  if (thread.type !== 'regular' || thread.introduction_request_id !== null) return true;
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM tasks g WHERE g.thread_id = $1) AS found`,
    [thread.id],
    CASE_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

async function closeOwnersCase(userId: string, threadId: number): Promise<void> {
  const goal = await getGoalOnThread(threadId);
  if (goal !== null) {
    if (goal.status !== 'closed') {
      await stopGoal(userId, goal);
      await dismissStoppedGoal(userId, threadId);
    }
    await settleParticipantThreads(goal.id, threadId);
  }
  await setThreadStatus(userId, threadId, 'done');
}

async function closeHelpersCase(userId: string, threadId: number): Promise<void> {
  const waiting = await pendingIntroInMediatorThread(userId, threadId);
  if (waiting !== null) {
    await resolveIntroductionRequest(userId, { requestId: waiting }, 'decline', {
      source: 'button',
    });
  }
  await setThreadStatus(userId, threadId, 'done');
}

/** Closes the case for everyone in it; NotACase when it is a plain chat to erase. */
export async function closeCaseInsteadOfDeleting(
  userId: string,
  thread: Thread,
): Promise<CaseCloseOutcome> {
  if (!(await isACase(thread))) return CaseCloseOutcome.NotACase;
  if (thread.type === 'regular' || thread.type === 'outgoing_request') {
    await closeOwnersCase(userId, thread.id);
  } else {
    await closeHelpersCase(userId, thread.id);
  }
  return CaseCloseOutcome.Closed;
}
