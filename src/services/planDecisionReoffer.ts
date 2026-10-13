import { lastQuestionIn } from './buttonsCarryTheQuestion';
import { APPROVE_LABEL, CHANGE_LABEL } from './choiceNotes';
import { RunLanguage } from './runLanguage';
import { PLAN_CLOSING_QUESTION } from './taskPlans.service';

/**
 * The tester's 56697 (T4886 follow-up, 13 Oct, 2 of 3): after „რატომ თამაზი?"
 * about a proposed plan, the run answered the why and stopped — no question,
 * no buttons. The plan's „ვადასტურებ / შევცვალოთ" belonged to the reply that
 * proposed it, so the owner was left with a decision still open and nothing
 * to tap. While a goal's proposed plan waits for the owner, a reply in its
 * thread that asks nothing and offers nothing asks again, with the plan's own
 * closing question and its own two buttons.
 */
export interface PlanState {
  readonly plan_proposed: unknown;
  readonly plan_approved_at: string | null;
  readonly plan_change_requested_at: string | null;
}

/** A proposed plan the owner has neither approved nor asked to change. */
export function planWaitsForTheOwner(task: PlanState | null): boolean {
  return (
    task !== null &&
    task.plan_proposed !== null &&
    task.plan_approved_at === null &&
    task.plan_change_requested_at === null
  );
}

/** The reply with the plan's question and buttons again; null when it already asks or offers. */
export function withPlanDecisionAgain(
  reply: string,
  offered: readonly string[] | undefined,
  task: PlanState | null,
  language: RunLanguage,
): { readonly text: string; readonly choices: string[] } | null {
  if ((offered ?? []).length > 0 || lastQuestionIn(reply) !== null) return null;
  if (!planWaitsForTheOwner(task)) return null;
  return {
    text: `${reply.trimEnd()}\n\n${PLAN_CLOSING_QUESTION[language]}`,
    choices: [APPROVE_LABEL[language], CHANGE_LABEL[language]],
  };
}
