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
