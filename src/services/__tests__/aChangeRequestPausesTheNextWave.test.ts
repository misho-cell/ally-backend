import { readFileSync } from 'fs';
import { join } from 'path';

const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');
const plans = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

/**
 * ROW 238 — NOTHING ANYWHERE REVOKED A STANDING PERMISSION.
 *
 * `withdrawsTheApproval` has existed for days and is used in three places,
 * every one of them deciding whether a NEW `approve_task_plan` counts. It has
 * never closed one already standing: `grep "permission_granted = FALSE"`
 * returns nothing, and so does `grep "plan_approved_at = NULL"`.
 *
 * MEASURED BEFORE BUILDING, over the whole history — goals with an approved
 * plan whose owner afterwards asked for a change:
 *
 *     such goals                                          2
 *     of those, an ask that went out AFTER the change      0
 *
 *     5743  a real person   approved 09-18 14:11, change asked a DAY later
 *     8251  Netai Test 1    approved 18:19, change asked 18:39
 *
 * Nobody has walked through the hole. That is not a reason to leave it open —
 * it is the consent wall, and „five symptom-free days is a good sign and not
 * proof" is already written on this board about row 101.
 *
 * ────────────────────────────────────────────────────────────────────────
 * AND IT IS NOT A REVOCATION, WHICH IS THE WHOLE SHAPE OF THE ANSWER.
 *
 * The founder's sentence has two halves (D119):
 *
 *     „a change to the plan needs a new yes, AND THE UNCHANGED PARTS KEEP
 *      RUNNING MEANWHILE"
 *
 * Clearing `plan_approved_at` keeps the first and breaks the second. So the
 * plan stays approved, what is in flight stays in flight, and what waits is
 * the AUTOMATIC NEXT WAVE.
 * ────────────────────────────────────────────────────────────────────────
 */
describe('the plan is not revoked', () => {
  it('nothing clears the approval or the permission', () => {
    for (const source of [store, plans, chat, engine]) {
      expect(source).not.toContain('plan_approved_at = NULL');
      expect(source).not.toContain('permission_granted = FALSE');
    }
  });

  it('only a goal with a plan ACTUALLY in force can be held', () => {
    const at = store.indexOf('export async function notePlanChangeRequested');
    const fn = store.slice(at, at + 900);

    expect(fn).toContain("status = 'open'");
    expect(fn).toContain('plan_approved_at IS NOT NULL');
    // And it does not re-stamp one already held, so „when" stays the first ask.
    expect(fn).toContain('plan_change_requested_at IS NULL');
  });
});

/**
 * THE WAVES THAT WAIT, NAMED ONE BY ONE.
 *
 * This project's most frequent fault is the rule on one wire while the other
 * keeps running — four times this week in my own work. So each gate is
 * asserted by name here, and a new sweeper that starts a wave without one
 * fails this test rather than somebody's goal.
 */
describe('the automatic next wave waits', () => {
  it('the ticker skips a held goal', () => {
    const at = store.indexOf('export async function getDueTasks');
    expect(store.slice(at, at + 900)).toContain('AND plan_change_requested_at IS NULL');
  });

  it('the silent-day widening skips a held goal', () => {
    const at = store.indexOf('export async function getSilentGoals');
    expect(store.slice(at, at + 1100)).toContain('AND t.plan_change_requested_at IS NULL');
  });

  it('day one stands down, and does NOT close its own wake', () => {
    const at = engine.indexOf('export function startDayOne');
    const fn = engine.slice(at, at + 2200);

    expect(fn).toContain('task?.plan_change_requested_at != null');
    // The wake is left open on purpose: the approval that follows finds it
    // still there rather than having to arm a second one. The window is the
    // held branch itself — up to its own `return false`, and no further, or
    // this reads the NEXT callback's `finishWake` and passes by accident.
    const heldAt = fn.indexOf('plan_change_requested_at != null');
    const branch = fn.slice(heldAt, fn.indexOf('return false;', heldAt));
    expect(branch).not.toContain('finishWake');
  });

  /**
   * AND THE METHOD-CHANGE SWEEP IS DELIBERATELY NOT GATED. It proposes a plan
   * change, which is exactly what the owner asked for — pausing it would hold
   * back the one wake that can end the hold.
   */
  it('the method-change sweep is left running on purpose', () => {
    const at = store.indexOf('export async function getGoalsSilentForDays');
    expect(store.slice(at, at + 1100)).not.toContain('plan_change_requested_at');
  });
});

describe('what ends the hold', () => {
  /**
   * IN THE SAME STATEMENT THAT RECORDS THE APPROVAL, so there is no instant in
   * which a goal is approved and still held.
   */
  it('the new yes clears it where it is written', () => {
    const at = plans.indexOf('export async function approveTaskPlan');
    const fn = plans.slice(at, at + 1400);

    expect(fn).toContain('plan_change_requested_at = NULL');
    expect(fn.indexOf('plan_change_requested_at = NULL')).toBeLessThan(fn.indexOf('RETURNING'));
  });
});

/**
 * AND THE STAMP IS ON THE ONE PATH EVERY RUN COMES THROUGH, beside the line
 * that already tells a person's words from the engine's own.
 *
 * An event that happens to contain „instead" is the product talking to itself
 * and must not pause anybody's goal — the same distinction row 259 needed one
 * file over.
 */
describe('only a person can ask for the change', () => {
  it('is taken in processChat, gated on ownerAbsent', () => {
    expect(chat).toContain('if (!ownerAbsent && asksToChangeThePlan(userMessage)) {');
  });

  it('never fails the person’s own reply', () => {
    const at = chat.indexOf('if (!ownerAbsent && asksToChangeThePlan(userMessage))');
    expect(chat.slice(at, at + 900)).toContain('.catch(');
  });
});

/**
 * SECOND CUT — TWO LISTS, BECAUSE THE TWO ANSWERS COST DIFFERENT THINGS, AND
 * THE SEAT'S OWN CONTROL FOUND IT WITHIN THE HOUR.
 *
 * On goal 9871, at 17:02:13, the owner typed „By the way, tomorrow I will be
 * at home INSTEAD of the office." — and the goal was held. A real goal, paused
 * because somebody mentioned where they would be, with nothing on any screen
 * to say so. That is the fault this whole row is about, arriving through the
 * fix for it.
 *
 * The broad list is not wrong where it lives: it decides whether a NEW
 * approval counts, where „refusing a real yes costs the owner one more tap".
 * Pausing a goal is not one tap — it is invisible and it stops the work.
 */
describe('the pause has a narrower trigger than the consent check', () => {
  const { asksToChangeThePlan } = jest.requireActual<{
    asksToChangeThePlan: (s: string) => boolean;
  }>('../chat.service');

  it.each([
    ['Change the plan.'],
    ['შეცვალე გეგმა'],
    ['do it differently'],
    ["let's change who you ask"],
  ])('holds on %s', (line) => {
    expect(asksToChangeThePlan(line)).toBe(true);
  });

  /** The one the seat caught, and the family it belongs to. */
  it.each([
    ['By the way, tomorrow I will be at home instead of the office.'],
    ['Can you find someone to rewrite my CV?'],
    ['I will take the metro instead.'],
  ])('does NOT hold on %s', (line) => {
    expect(asksToChangeThePlan(line)).toBe(false);
  });

  /**
   * AND WHAT IT MISSES IS WRITTEN DOWN RATHER THAN DISCOVERED. „Ask only Netai
   * Test 8, not Netai Test 10" IS a change request and this list does not
   * catch it. The wave may start on a plan the owner is mid-changing — which
   * is what happened before today, is visible, and leaves the consent wall
   * standing in front of every send. The lesser of the two.
   */
  it('misses a change request that names people instead of the plan', () => {
    expect(asksToChangeThePlan('Ask only Netai Test 8, not Netai Test 10.')).toBe(false);
  });
});
