import { Task, updateTask, getOpenTaskByThread } from './taskStore.service';
import { cancelAsksForTask } from './taskAsks.service';
import { setThreadStatus } from './threadStatus.service';
import { getThread } from './threads.service';

/**
 * The owner's kill switch, in one place.
 *
 * Ticket 20 row 113: the header button posted `/tasks/<THREAD id>/stop`, got a
 * 404 nobody saw, and left the owner believing a running goal had stopped while
 * it kept working and kept waking. The frontend has no goal id in the chat view
 * — they checked their thread object and it carries id, type, title,
 * last_message, updated_at, status, status_line, is_task and request_ref, and
 * nothing else — so they asked for a thread-keyed route.
 *
 * Two routes, one behaviour. Written here rather than copied into the second
 * one, because two stop paths that drift apart is a worse bug than the one
 * being fixed: the version that forgot to cancel the asks would go on writing
 * to real people after the owner stopped the goal.
 *
 * Deliberately NOT solved by letting `/tasks/:id/stop` accept either kind of
 * id. A thread id and a task id can collide inside one account, and a stop
 * route that guesses which one it was handed could stop the WRONG goal. The
 * frontend reached the same conclusion independently: better a visible failure
 * than a silent wrong action.
 */
export interface GoalStopped {
  readonly stopped: boolean;
  readonly goal_id: number | null;
  /** Present only when there was nothing to stop. */
  readonly reason?: 'no_open_goal';
}

/**
 * Close the goal, cancel every unanswered ask (the recipients get an honest
 * „no longer needed" line) and settle the thread. Idempotent: stopping a goal
 * that is already closed succeeds and changes nothing.
 */
export async function stopGoal(userId: string, task: Task): Promise<GoalStopped> {
  if (task.status !== 'closed') {
    await updateTask(userId, task.id, 'closed', 'stopped_by_user');
  }
  await cancelAsksForTask(task.id);
  if (task.thread_id !== null) {
    void setThreadStatus(userId, task.thread_id, 'done', { statusLine: 'შეჩერებულია' });
  }
  return { stopped: true, goal_id: task.id };
}

/** What the routes answer when the thread carries no goal that could be running. */
export const NOTHING_TO_STOP: GoalStopped = {
  stopped: false,
  goal_id: null,
  reason: 'no_open_goal',
};

/**
 * Stop whatever goal is running on a THREAD the owner holds.
 *
 * `null` means „this is not a thread of theirs" and is the routes' 404; it is
 * kept distinct from NOTHING_TO_STOP on purpose, because „no such thread" and
 * „your thread, nothing running on it" are different things to show a person
 * and were being collapsed into one 404 before row 113.
 *
 * Ownership is checked on the thread first. The goal lookup is keyed on the
 * thread id alone, so checking after would let one account's thread id reach
 * another account's goal.
 */
export async function stopGoalOnThread(
  userId: string,
  threadId: number,
): Promise<GoalStopped | null> {
  const thread = await getThread(threadId, userId);
  if (!thread) return null;
  const task = await getOpenTaskByThread(threadId);
  if (!task) return NOTHING_TO_STOP;
  return stopGoal(userId, task);
}
