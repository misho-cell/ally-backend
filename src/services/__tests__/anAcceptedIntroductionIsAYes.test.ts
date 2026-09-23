import { readFileSync } from 'fs';
import { join } from 'path';
import { planAllows } from '../taskPlans.service';

/**
 * ROW 251 / D438 — THE TARGET'S OWN YES LOST TO A LIST IT WAS NEVER ON.
 *
 * The founder's rule: after the mediator's yes, the asker's and the solver's
 * assistants get a direct channel — the asker writes one line, it lands in the
 * solver's chat, the reply comes back the same way, and nobody is told to go
 * and write to somebody themselves.
 *
 * The wall in the way was `planAllows`. A plan is the OWNER saying „you may
 * write to these people". An accepted introduction is THE TARGET THEMSELVES
 * saying „yes, they may reach me", relayed by somebody who knows them both.
 * That is the stronger consent of the two, and it counted for nothing.
 *
 * WHY THIS FILE IS MOSTLY ABOUT WHAT IS *NOT* OPENED. This widens who the model
 * may write to, which is the one direction that cannot be corrected after the
 * fact — a message that should not have gone cannot be recalled. So the tests
 * that matter here are the three that keep it narrow, and they outnumber the
 * one that opens it.
 */
const plan = {
  version: 1,
  approved_at: '2026-09-23T08:00:00Z',
  people_to_involve: [{ phone: '+995500000001', name: 'In the plan' }],
  never_contact: [{ phone: '+995500000002', name: 'Never this one' }],
} as never;

const TARGET = '+995500000003';

describe('an accepted introduction opens the one door it should', () => {
  it('still refuses a stranger the plan does not name', () => {
    expect(planAllows(plan, TARGET)).toEqual({ allowed: false, reason: 'outside_plan' });
  });

  it('lets through the person who accepted, and says why', () => {
    expect(planAllows(plan, TARGET, [TARGET])).toEqual({
      allowed: true,
      reason: 'accepted_introduction',
    });
  });

  /** The spelling of a number is not the number. */
  it('matches on digits rather than on formatting', () => {
    expect(planAllows(plan, '+995 500 00 00 03', [TARGET]).allowed).toBe(true);
    expect(planAllows(plan, TARGET, ['995500000003']).allowed).toBe(true);
  });
});

describe('and it is checked in the right order, which is the whole safety of it', () => {
  /**
   * NEVER_CONTACT OUTRANKS AN ACCEPTANCE, AND IT HAS TO.
   *
   * These are two people saying different things: the target says „they may
   * reach me", the OWNER says „not this person, for this goal". It is the
   * owner's goal, and their „never" is about whether they want it at all — so
   * an acceptance cannot reach past it, even though the acceptance is the
   * stronger evidence of the target's own willingness.
   *
   * Written as its own test because getting the ORDER wrong inside the function
   * would leave every other test in this file green.
   */
  it('refuses somebody on never_contact even when they accepted', () => {
    expect(planAllows(plan, '+995500000002', ['+995500000002'])).toEqual({
      allowed: false,
      reason: 'never_contact',
    });
  });

  /** A goal with no plan is unchanged — the blanket gate decides elsewhere. */
  it('changes nothing where there is no plan', () => {
    expect(planAllows(null, TARGET, [TARGET])).toEqual({ allowed: true, reason: 'no_plan' });
  });

  /**
   * AND EVERY CALLER THAT DOES NOT PASS THE LIST IS UNTOUCHED. The parameter
   * defaults to empty, so nothing widens anywhere it was not deliberately
   * wired — which is what makes this safe to add to a function with other
   * callers.
   */
  it('opens nothing for a caller that passes no acceptances', () => {
    expect(planAllows(plan, TARGET, []).allowed).toBe(false);
    expect(planAllows(plan, TARGET).allowed).toBe(false);
  });
});

describe('the loader is scoped to one goal and one asker', () => {
  const plans = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  /**
   * ONE GOAL. An introduction accepted for a plumber must not open a channel
   * inside an unrelated goal, and the only thing preventing that is this
   * clause.
   */
  it('reads only this task’s acceptances, from this asker', () => {
    const at = plans.indexOf('export async function acceptedIntroductionPhones');
    const fn = plans.slice(at, at + 1200);

    expect(fn).toContain('WHERE requester_task_id = $1');
    expect(fn).toContain('AND requester_user_id = $2::text');
    expect(fn).toContain("AND status = 'accepted'");
  });

  /**
   * A DATABASE HICCUP MUST NARROW THE GATE, NOT WIDEN IT. Returning the phones
   * on failure is unthinkable; returning none costs a retry.
   */
  it('returns nothing when it cannot read', () => {
    const at = plans.indexOf('export async function acceptedIntroductionPhones');
    expect(plans.slice(at, at + 1200)).toContain('catch {\n    return [];');
  });

  /** And the wire, which is the part a unit test of the predicate cannot see. */
  it('is actually consulted where asks are created', () => {
    expect(asks).toContain('acceptedIntroductionPhones(taskId, fromUserId)');
    expect(asks).toContain('planAllows(planInForce(planRow), contactPhone, acceptedPhones)');
  });
});

/**
 * THE OTHER HALF OF THE ROW, AND WHY THE NUMBER HAS TO BE RECORDED AT
 * ACCEPTANCE OR NONE OF THE ABOVE FIRES.
 *
 * `planAllows` matches on a phone. Measured before any of this was written, of
 * every accepted introduction there has ever been:
 *
 *     accepted                                        37
 *       carrying a target phone                       14
 *       carrying a requester task                     13
 *       carrying BOTH — what the gate can use          4
 *
 * So the gate alone would have fixed four of thirty-seven and looked finished.
 * The missing phone is not an omission at the asking end: in a mediated
 * introduction the requester does not HAVE the number, which is the entire
 * reason they are asking a mediator. Acceptance is where it becomes known,
 * because the mediator is the person who has it.
 */
describe('acceptance records the number, which is what makes the gate reachable', () => {
  const intro = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');

  it('fills the target phone when the answer lands', () => {
    expect(intro).toContain('target_phone = COALESCE(');
    expect(intro).toContain('SELECT up.phone FROM "UserPhone" up');
  });

  /**
   * COALESCE, NOT AN OVERWRITE. A direct introduction resolved its phone when
   * it was created, from the requester's own book, and that is better evidence
   * than this lookup.
   */
  it('never overwrites a number already recorded', () => {
    const at = intro.indexOf('target_phone = COALESCE(');
    expect(intro.slice(at, at + 260)).toContain('COALESCE(\n           target_phone,');
  });
});
