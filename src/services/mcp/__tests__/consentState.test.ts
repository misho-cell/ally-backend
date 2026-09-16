/**
 * Ticket 20 row 134 — the connector told every member that every plan was
 * approved.
 *
 * The test was `t.plan !== null && t.plan_approved_at !== null`, and
 * getMyTasks did not SELECT either column. They arrived as undefined, and
 * `undefined !== null` is TRUE, so the first branch matched on every goal in
 * the list. The seat caught it on goals 3697-3703, where the admin read
 * plan_approved_at null, stage plan_proposed and permission false on every
 * one. It was not those seven — it was every goal, on every account, on that
 * path.
 *
 * Two fixes. The columns are selected now, which stops it today. And the
 * checks refuse to claim a consent state from data that is not there, which
 * stops the next caller who forgets a column — the one this file is really
 * about.
 */
import { consentStateFor } from '../handlers';
import { APPROVE_PLAN_DESCRIPTION } from '../../chat.service';
import { TOOL_TEXTS } from '../texts';

const APPROVED = {
  permission_granted: true,
  plan: { solved_when: 'x', routes: [], people_to_involve: [], never_contact: [] },
  plan_proposed: null,
  plan_approved_at: '2026-09-16T15:50:33Z',
};

describe('row 134 — missing data is never a yes', () => {
  it('the exact shape that produced the lie: every plan field absent', () => {
    // What getMyTasks actually returned before the columns were selected.
    const partial = { permission_granted: false } as never;

    expect(consentStateFor(partial)).toBe('none');
  });

  it('a permission flag with no plan data is a legacy grant, not an approval', () => {
    const partial = { permission_granted: true } as never;

    expect(consentStateFor(partial)).toBe('legacy_grant');
  });

  it('a real approval still reads approved', () => {
    expect(consentStateFor(APPROVED as never)).toBe('plan_approved');
  });

  it('a proposed plan with no yes is awaiting — the 3697-3703 case', () => {
    expect(
      consentStateFor({
        permission_granted: false,
        plan: null,
        plan_proposed: { solved_when: 'x', routes: [], people_to_involve: [], never_contact: [] },
        plan_approved_at: null,
      } as never),
    ).toBe('plan_awaiting_yes');
  });

  it('a plan in force with NO approval timestamp is not an approval', () => {
    // Half the evidence is not evidence. This is the pair the original test
    // required, and the pair is still required — only the way it is read
    // changed.
    expect(consentStateFor({ ...APPROVED, plan_approved_at: null } as never)).not.toBe(
      'plan_approved',
    );
  });

  it('an approval timestamp with no plan is not an approval either', () => {
    expect(consentStateFor({ ...APPROVED, plan: null } as never)).not.toBe('plan_approved');
  });
});

/**
 * Ticket 20 row 136 — the model tried to approve its own plan.
 *
 * Goal 3700, run dab5fe, 16 September, 14:37:40: approve_task_plan was called
 * with no yes from the user at all. The server refused it — the wall holds,
 * and that is finished row 1 — but a model reaching for it means the text was
 * not saying enough.
 *
 * „After they explicitly approved" was already there. A model that has just
 * written a persuasive summary can read its own words as the approval, so the
 * text now names WHOSE turn the yes has to be in and rules out its own.
 */
describe('row 136 — the approve tool says whose yes it needs', () => {
  it('requires the yes to be in THIS turn, not merely somewhere', () => {
    expect(APPROVE_PLAN_DESCRIPTION).toContain('IN THIS');
    expect(APPROVE_PLAN_DESCRIPTION).toContain('TURN');
  });

  it('rules out the assistant’s own words, which is what happened', () => {
    expect(APPROVE_PLAN_DESCRIPTION).toContain('Your own summary');
    expect(APPROVE_PLAN_DESCRIPTION).toContain('not approvals');
    expect(APPROVE_PLAN_DESCRIPTION).toContain('the newest message is yours');
  });

  it('names both roads to a yes — row 122 kept the typed one', () => {
    expect(APPROVE_PLAN_DESCRIPTION).toContain('approve button');
    expect(APPROVE_PLAN_DESCRIPTION).toContain('go-ahead they typed');
  });

  it('the connector and the app say the SAME thing, not two versions of it', () => {
    expect(TOOL_TEXTS.approve_task_plan.description).toBe(APPROVE_PLAN_DESCRIPTION);
  });
});
