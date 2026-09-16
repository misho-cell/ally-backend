/**
 * Goal 3466 / thread 15577, reported 16 September — a goal that looked finished
 * and could no longer be stopped.
 *
 * The tester typed a detail under the plan card („ეკრანი 15 დიუიმიანია."). The
 * model answered it in a sentence: no question mark, no buttons. The run's
 * terminal status fell through to `done`.
 *
 * The app then showed „დასრულდა", filed the goal among the finished ones, and
 * hid BOTH the approve buttons and the header „გაჩერება". A reload did not
 * bring them back. Meanwhile the database said: status open, stage
 * plan_proposed, blocker plan_approval, plan_approved_at null. The owner could
 * no longer approve the plan, change it, or stop it, and the goal stayed open
 * behind a screen that said it was over.
 *
 * The cause is one question asked of the wrong thing. Every rule below the top
 * of statusAfterRun reads the REPLY — does it end in a question, does it carry
 * buttons. That is right for a plain conversation and wrong for a goal: a
 * proposed plan nobody has approved is waiting on the owner no matter how the
 * last sentence was punctuated.
 */
import { awaitingPlanApproval } from '../threads.routes';

type PlanFields = Parameters<typeof awaitingPlanApproval>[0];

const PLAN = { solved_when: 'ეკრანი შეცვლილია', people_to_involve: [] } as unknown;

function task(fields: Partial<NonNullable<PlanFields>>): PlanFields {
  return {
    plan: null,
    plan_version: 1,
    plan_approved_at: null,
    plan_proposed: null,
    ...fields,
  } as PlanFields;
}

describe('a goal waiting for its plan to be approved', () => {
  it('is waiting — the exact state goal 3466 was in', () => {
    expect(awaitingPlanApproval(task({ plan_proposed: PLAN as never }))).toBe(true);
  });

  it('is not waiting once the plan is in force', () => {
    expect(
      awaitingPlanApproval(
        task({
          plan_proposed: PLAN as never,
          plan: PLAN as never,
          plan_approved_at: '2026-09-16T07:00:00Z',
        }),
      ),
    ).toBe(false);
  });

  it('is not waiting when no plan was ever proposed', () => {
    expect(awaitingPlanApproval(task({}))).toBe(false);
  });

  it('is not waiting when there is no goal on the thread at all', () => {
    expect(awaitingPlanApproval(null)).toBe(false);
  });

  it('is still waiting when a plan is proposed as a REVISION of one in force', () => {
    // v2 proposed while v1 runs: the new one still needs the owner, and the
    // thread must not read as finished while it sits there.
    expect(
      awaitingPlanApproval(
        task({ plan_proposed: PLAN as never, plan: null, plan_approved_at: null, plan_version: 2 }),
      ),
    ).toBe(true);
  });
});
