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
import { awaitingPlanApproval, statusAfterRun } from '../threads.routes';

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

/**
 * The battery run of 17 September — the sidebar had it backwards.
 *
 * The seat's reading: under „ongoing" sat four threads with no open goal, one
 * still labelled working; under „finished" sat the founder's two LIVE goals,
 * 3433 (open, two asks out, a wake at 20:40) and 3763 (open, a wake the next
 * afternoon). Nothing was wrong with either goal. Both had simply had a turn
 * that asked nothing and was waiting on nobody, and that fell through to done.
 *
 * Which is the same mistake the two rules above it were written for, a third
 * time: the status asked what the SERVER had just said instead of what the
 * WORK was waiting for.
 */
describe('a thread whose goal is still open', () => {
  const quietReply = { reply: 'გავაგრძელებ და შედეგს მოგწერ.' } as Parameters<
    typeof statusAfterRun
  >[0];

  it('is never FINISHED, however quiet the last reply was', () => {
    expect(
      statusAfterRun(quietReply, false, {
        workItem: true,
        flagged: false,
        awaitingPlanApproval: false,
        openGoal: true,
      }),
    ).toBe('waiting');
  });

  it('still says needs_you when the run actually asked something', () => {
    // The open goal must not swallow a real question to the owner.
    expect(
      statusAfterRun(
        { reply: 'რომელი გირჩევნია?' } as Parameters<typeof statusAfterRun>[0],
        false,
        {
          workItem: true,
          flagged: false,
          awaitingPlanApproval: false,
          openGoal: true,
        },
      ),
    ).toBe('needs_you');
  });

  it('leaves an ordinary conversation finished, which it is', () => {
    expect(
      statusAfterRun(quietReply, false, {
        workItem: false,
        flagged: false,
        awaitingPlanApproval: false,
        openGoal: false,
      }),
    ).toBe('done');
  });

  it('files a work item with NO open goal as done, exactly as before', () => {
    // A closed goal's thread, an answered ask: those are genuinely over, and
    // this change must not sweep them back into the ongoing half.
    expect(
      statusAfterRun(quietReply, false, {
        workItem: true,
        flagged: false,
        awaitingPlanApproval: false,
        openGoal: false,
      }),
    ).toBe('done');
  });
});
