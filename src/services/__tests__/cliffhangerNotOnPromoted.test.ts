import { isCliffhangerReply } from '../replyGuards';

/**
 * Row 206 — three statements of one state, in one message, from two rescues.
 *
 * Goal 6238, and the arithmetic is the whole finding:
 *
 *   P1  tool-round narration   275 chars   „I asked Test 4 and Test 6…"
 *   P2  the model's final      120 chars   „Running now… I'll check back within a day"
 *   P3  appended afterwards    236 chars   „No replies yet…"
 *
 * The buried-answer rescue promotes a narration of 200+ chars that is longer
 * than the final, giving 275 + 2 + 120 = 397. The cliffhanger guard fires at
 * 400 or below. THREE CHARACTERS. It nudged, the model wrote P3, and the owner
 * read the same state three times.
 *
 * The guard is for a SHORT final that is only an announcement. A promoted
 * final is by construction not that, so it is no longer measured — the string
 * being measured was not the one the threshold was written for.
 */
const P1 =
  "I asked Netai Test 4 and Netai Test 6 whether they can personally recommend a good dentist in Tbilisi. Netai Test 2 couldn't be reached right now, they've already hit their limit on incoming questions from others in the last 24 hours, so I'll try them again once that clears.";
const P2 =
  "Running now: waiting on Test 4 and Test 6, retrying Test 2 later. I'll check back within a day and report what comes in.";

describe('row 206 — the three characters', () => {
  it('the model’s own final IS a cliffhanger by the guard’s own rule', () => {
    // Nothing here disputes that: on its own, P2 is short and ends in a
    // check-back. The guard is doing what it was written to do.
    expect(P2.length).toBeLessThan(400);
    expect(isCliffhangerReply(P2)).toBe(true);
  });

  it('and the concatenation is still under the threshold, by three characters', () => {
    const promoted = `${P1}\n\n${P2}`;
    // The number that made this happen. If either paragraph or the threshold
    // changes, this stops being the story and the test should be re-read.
    expect(promoted.length).toBe(397);
    expect(isCliffhangerReply(promoted)).toBe(true);
  });

  it('which is why the CALLER no longer asks about a promoted final', () => {
    // The fix is not in this predicate and must not be: a short announcement
    // that was never promoted is exactly what it should still catch.
    const bare = 'Let me check and I will come back to you.';
    expect(isCliffhangerReply(bare)).toBe(true);
  });
});

/**
 * WHAT WAS MEASURED AND DELIBERATELY NOT SHIPPED.
 *
 * 500 real finals from the last seven days: the guard fires four times, and
 * all four are promises to check again at a named time — „20 სექტემბერს კვლავ
 * შევამოწმებ", „სამი დღის შემდეგ", „ხვალ დილით" — not cliffhangers.
 *
 * The obvious fix is to exempt a tail naming a later time. It spares all four.
 * That is the reason it is not here: in a sample with no true positives,
 * „precise exemption" and „the guard has nothing left to catch" are the same
 * measurement, and the guard was built from five real cases that are not in
 * this week's data. It would need testing against THOSE before it could ship.
 */
describe('the exemption that was measured and not taken', () => {
  it('a bare promise to check later is still treated as a cliffhanger', () => {
    // Recording the current answer so the day it changes, it changes on
    // purpose — the same reason row 103's undecided case has a test.
    expect(isCliffhangerReply('I will check back within a day.')).toBe(true);
  });
});
