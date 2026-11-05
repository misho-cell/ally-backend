import { Task } from './taskStore.service';
import { planInForce } from './taskPlans.service';
import { currentStepId, recentStepEvents } from './planProgress.service';
import { renderWhereWeAre } from './whereWeAre';

/**
 * K4: the „where we are" block for a goal run — empty for a goal with no
 * approved plan, and empty (logged) when progress cannot be read: the prompt is
 * never held up by it.
 */
export async function whereWeAreSection(task: Task): Promise<string> {
  const plan = planInForce(task);
  if (plan === null || plan.approved_at === null) return '';
  try {
    const [current, events] = await Promise.all([
      currentStepId(task.id),
      recentStepEvents(task.id, 1),
    ]);
    return renderWhereWeAre({ plan, currentStepId: current, events });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[plan-steps] task ${task.id}: where-we-are unread:`, (err as Error).message);
    return '';
  }
}
