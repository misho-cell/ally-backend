import { Task, updateTask, getOpenTaskByThread } from './taskStore.service';
import { cancelAsksForTask } from './taskAsks.service';
import { setThreadStatus } from './threadStatus.service';
import { getThread, saveThreadMessage } from './threads.service';
import { markThreadStopped } from './stoppedRuns';

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
 * The line the thread gets when the BUTTON stops a goal.
 *
 * Row 113, third pass. The tester's read of 41df5de: goal 4456 on thread 16602
 * went to stage stopped, status closed, the button left the header — and the
 * thread said nothing at all. A goal that stops in silence is indistinguishable
 * from a goal that stopped for some other reason, or from a button that did
 * nothing; the typed stop names what it stopped, and the button now does too.
 *
 * The count of cancelled asks is in it because it is the part the owner cannot
 * see: „I stopped it" reads very differently to someone who has three questions
 * out in their name than to someone who has none, and those three people have
 * just been told the question is off.
 */
export function stoppedLine(title: string, cancelledAsks: number): string {
  const head = `შევაჩერე: ${title}`;
  if (cancelledAsks <= 0) return `${head}. ახალი არაფერი გაიგზავნება.`;
  const asks =
    cancelledAsks === 1
      ? 'ერთი გაგზავნილი კითხვა გავაუქმე და იმ ადამიანს ვაცნობე'
      : `${cancelledAsks} გაგზავნილი კითხვა გავაუქმე და იმ ადამიანებს ვაცნობე`;
  return `${head}. ${asks}. ახალი არაფერი გაიგზავნება.`;
}

/**
 * Close the goal, cancel every unanswered ask (the recipients get an honest
 * „no longer needed" line), say so in the thread and settle it. Idempotent:
 * stopping a goal that is already closed succeeds, and — the part that has to
 * be deliberate — says nothing a second time. The tester presses the button
 * twice on purpose, and two identical „I stopped it" lines would be row 157
 * again in miniature.
 */
export async function stopGoal(userId: string, task: Task): Promise<GoalStopped> {
  const wasOpen = task.status !== 'closed';
  // Row 113 fourth pass, and FIRST in this function on purpose: a run that is
  // working right now must learn it has been stopped before anything else
  // takes a turn. Closing the row took four awaits to reach the thread, and in
  // that window the run had already written its next line.
  if (task.thread_id !== null) markThreadStopped(task.thread_id);
  if (wasOpen) {
    await updateTask(userId, task.id, 'closed', 'stopped_by_user');
  }
  const cancelledAsks = await cancelAsksForTask(task.id);
  if (task.thread_id !== null) {
    if (wasOpen) {
      await saveThreadMessage(
        task.thread_id,
        Number(userId),
        'assistant',
        stoppedLine(task.title, cancelledAsks),
      ).catch(() => undefined);
    }
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
