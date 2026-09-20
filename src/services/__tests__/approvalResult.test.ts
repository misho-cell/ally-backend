jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { approvalResult } from '../chat.service';

/**
 * Ticket 20 row 209 — a plan approved twice.
 *
 * Goal 5580, 18 September. The owner typed „ვამტკიცებ" and then „ok" three
 * seconds later; the second message started a second run, and the two raced
 * into approve_task_plan 1.5 seconds apart. The first won. The second was told
 * „No proposed plan is waiting on this goal."
 *
 * That run then had an owner who had plainly said yes and a tool saying no
 * plan existed, so it did day one's work by hand — two asks — and day one did
 * the same two forty seconds later. Task 4627 the day before is the same
 * sequence with five people.
 *
 * The database was right the whole time: the UPDATE needs `plan_proposed IS
 * NOT NULL` and so is idempotent by construction. What was wrong was what it
 * SAID about having changed nothing.
 *
 * This is the half of the fix that decides what the second caller is told, and
 * whether the ask wall applies to it. The two must agree: the wall blocks this
 * run from writing to the plan's people BECAUSE day one is coming, and the
 * note is where the model is told so.
 */
const WINDOW_MS = 203_000;
const APPROVED_AT = '2026-09-18T12:52:08.012Z';
const at = (offsetMs: number): Date => new Date(new Date(APPROVED_AT).getTime() + offsetMs);

describe('what an approval tells the model', () => {
  it('treats a fresh approval as day one’s start, whatever the clock says', () => {
    // approvedAt is NOW on this branch, but the branch does not depend on it:
    // a run that performed the approval always starts day one.
    const out = approvalResult(
      { alreadyInForce: false, approvedAt: APPROVED_AT },
      at(0),
      WINDOW_MS,
    );
    expect(out.dayOneStillComing).toBe(true);
    expect(out.note).toContain('day one');
    expect(out.note).not.toContain('ALREADY approved');
  });

  it('tells the SECOND caller its call changed nothing, and still walls it', () => {
    const out = approvalResult(
      { alreadyInForce: true, approvedAt: APPROVED_AT },
      at(1_500),
      WINDOW_MS,
    );
    // The wall and the words agree: both say day one has this.
    expect(out.dayOneStillComing).toBe(true);
    expect(out.note).toContain('ALREADY approved');
    expect(out.note).toContain('do NOT call ask_contact in this turn');
    // And it does not read as a failure — this is the sentence that sent the
    // run on goal 5580 off to do day one's job itself.
    expect(out.note).toContain('nothing is wrong');
    expect(out.note).not.toMatch(/No proposed plan/i);
  });

  it('stops claiming day one is coming once the window has passed', () => {
    const out = approvalResult(
      { alreadyInForce: true, approvedAt: APPROVED_AT },
      at(WINDOW_MS + 1),
      WINDOW_MS,
    );
    expect(out.dayOneStillComing).toBe(false);
    expect(out.note).not.toContain('starts by itself');
    // Row 208's rule: what persists is a date, which is true at any distance.
    expect(out.note).toContain(APPROVED_AT);
    expect(out.note).not.toMatch(/today|moments/i);
    // And it still tells the model not to redo day one — it just no longer
    // claims something is on its way when nothing is.
    expect(out.note).toContain('do NOT repeat it');
  });

  it('holds the wall right up to the edge and not past it', () => {
    expect(
      approvalResult(
        { alreadyInForce: true, approvedAt: APPROVED_AT },
        at(WINDOW_MS - 1),
        WINDOW_MS,
      ).dayOneStillComing,
    ).toBe(true);
    expect(
      approvalResult({ alreadyInForce: true, approvedAt: APPROVED_AT }, at(WINDOW_MS), WINDOW_MS)
        .dayOneStillComing,
    ).toBe(false);
  });

  it('claims nothing about day one when the approval time cannot be read', () => {
    // Unreachable through the query, which selects on plan_approved_at IS NOT
    // NULL — so this is about which way the code falls when the impossible
    // happens. An unreadable time means we do not KNOW whether day one is
    // coming, and „it is coming" would then be a sentence with nothing behind
    // it. The other branch still tells the model not to redo day one, so the
    // duplicate is argued against either way; only the hard wall is dropped,
    // and a wall whose stated reason is unknown is the wrong kind of wall.
    const out = approvalResult(
      { alreadyInForce: true, approvedAt: 'not a date' },
      at(0),
      WINDOW_MS,
    );
    expect(out.dayOneStillComing).toBe(false);
    expect(out.note).toContain('do NOT repeat it');
  });
});

/**
 * The seat's 338, and the sibling of the day-one refusal's fix.
 *
 * This note is read on EVERY approval; the refusal needs the model to call
 * ask_contact first. Three of the four false claims measured on 20 September
 * came straight after an approval with no ask_contact call at all.
 *
 *   10:07:52  „Approved, and I'm on it. I've ASKED Netai Test 6…"    row created 10:08:23
 *   10:57:07  „Got it, I'm on it. I'll WRITE TO Netai Test 1 now…"   row created 10:57:42
 *
 * Same note, same position in the run, opposite tense. That is the seat's own
 * finding and it is what makes this a wording fix rather than a sequencing
 * one: the sentence CAN be true here and simply is not always, because „day
 * one writes to them" and „tell them you are on it" both describe a send in
 * hand and neither says when.
 */
describe('the tense the approval note asks for', () => {
  const note = (): string =>
    approvalResult(
      { alreadyInForce: false, approvedAt: new Date().toISOString() },
      new Date(),
      60_000,
    ).note;

  it('still says the true thing: the plan is the consent and day one runs itself', () => {
    expect(note()).toContain('that is the consent');
    expect(note()).toContain('day one starts by itself right behind your reply');
  });

  it('forbids the past tense BY NAME, in the words the runs actually produced', () => {
    expect(note()).toContain('DO NOT SAY IT HAS BEEN SENT');
    expect(note()).toContain('I have written to them');
    expect(note()).toContain('I have asked them');
    expect(note()).toContain('I have just sent');
  });

  it('says WHY, so the rule survives being paraphrased', () => {
    expect(note()).toContain('false when written');
  });

  it('hands over a sentence rather than only taking one away', () => {
    expect(note()).toContain('I am writing to X');
  });

  /**
   * The other branch — a plan that was already in force and whose day one has
   * run — must NOT carry this. There the sends really have happened, and
   * forbidding the past tense would make the product lie the other way.
   */
  it('says none of it once day one is actually over', () => {
    const old = approvalResult(
      { alreadyInForce: true, approvedAt: '2026-09-18T10:00:00.000Z' },
      new Date('2026-09-20T10:00:00.000Z'),
      60_000,
    );
    expect(old.dayOneStillComing).toBe(false);
    expect(old.note).not.toContain('DO NOT SAY IT HAS BEEN SENT');
  });
});
