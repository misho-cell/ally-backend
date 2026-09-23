import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 259 — THE OWNER'S OWN NEW SENTENCE WAS REFUSED AS A DUPLICATE, AND NEVER
 * REACHED THE PERSON IT WAS ABOUT.
 *
 * The seat, 23 September, goal 9736. Ask 4555 went to Netai Test 7 at
 * 13:53:19. The owner then typed „Tell Netai Test 7 that Thursday afternoon
 * works for me" at 13:54:05 and „The electrician visit." at 13:55:00. The send
 * at 13:55:12 was refused — 113 seconds, inside the ten-minute window — and
 * the words never arrived. The assistant kept them in the brief and said so,
 * which is honest and is not the same as delivering them.
 *
 * THE GUARD IT HIT IS NOT WRONG AND IS NOT BEING WEAKENED. It chose time and
 * silence over wording on a measurement: all four historical duplicates were
 * the model rewording its own question seconds apart, and a text comparison
 * would have caught NONE of them. So the answer is not to compare the text —
 * the tester's „a different message goes out" would have reopened all four.
 *
 * IT IS TO ASK WHETHER THE PERSON WHOSE NAME IS ON THE MESSAGE HAS SPOKEN.
 * Measured across every pair on record before a line was written:
 *
 *     goal 4627  ask 2050  20s after 2049   owner spoke between:  0
 *     goal 4627  ask 2051  21s              owner spoke between:  0
 *     goal 4627  ask 2052  21s              owner spoke between:  0
 *     goal 5580  ask 2246  40s after 2245   owner spoke between:  0
 *     goal 9736  the refused one, 113s      owner spoke between:  2
 *
 * Clean on all five. The four the guard exists for are a model firing twice
 * inside one run with nobody adding anything; the one it should not have
 * caught is a person typing a new sentence.
 */
describe('the duplicate guard asks whether the owner added something', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('lets the send through when they did', () => {
    const at = asks.indexOf('const ownerAddedSomething =');
    const block = asks.slice(at, at + 700);

    expect(block).toContain('await ownerSpokeSince(taskId, secondsSincePrevious)');
    expect(asks).toContain(
      'secondsSincePrevious < DUPLICATE_ASK_WINDOW_SECONDS &&\n    !ownerAddedSomething',
    );
  });

  /**
   * AND NOTHING ELSE ABOUT THE GUARD MOVED. Each of the three conditions the
   * four historical duplicates were caught by is still in the same `if`, so
   * this reads as one clause added rather than a rule rewritten.
   */
  it('keeps every condition the four duplicates were caught by', () => {
    const at = asks.indexOf('const ownerAddedSomething =');
    const block = asks.slice(at, at + 1400);

    for (const clause of [
      "previous?.status === 'sent'",
      'previous.from_user_id === fromUserId',
      'secondsSincePrevious < DUPLICATE_ASK_WINDOW_SECONDS',
    ]) {
      expect(block).toContain(clause);
    }
  });

  /**
   * AN EVENT IS THE PRODUCT TALKING TO ITSELF. `role = 'user'` also carries the
   * engine's own „[მოვლენა]" wake lines and the empty rows a button press
   * leaves; neither is a person adding something and neither may unlock a
   * second message in their name.
   */
  it('counts only a person typing, not a wake and not a button', () => {
    const at = asks.indexOf('async function ownerSpokeSince');
    const fn = asks.slice(at, at + 1600);

    expect(fn).toContain("c.role = 'user'");
    expect(fn).toContain("c.kind = 'message'");
    expect(fn).toContain("TRIM(c.content) <> ''");
  });

  /**
   * THE TIMESTAMP COMPARISON IS EXPLICIT. `conversations.created_at` has no
   * time zone; the server runs on UTC today, so a bare NOW() happens to work,
   * and „happens to work" is how this file already earned one „integer = text"
   * P0.
   */
  it('compares against an explicitly naive UTC instant', () => {
    const at = asks.indexOf('async function ownerSpokeSince');
    expect(asks.slice(at, at + 1600)).toContain("(NOW() AT TIME ZONE 'UTC')");
  });

  /**
   * FALSE ON FAILURE, which leaves the guard exactly as it was yesterday. A
   * failure here costs the owner a retry; the other direction costs somebody a
   * second copy of a question they have not answered.
   */
  it('refuses rather than sends when it cannot read', () => {
    const at = asks.indexOf('async function ownerSpokeSince');
    expect(asks.slice(at, at + 2000)).toMatch(/catch[\s\S]{0,200}return false;/);
  });

  /** And it goes out AS a follow-up: the recipient is told „wrote again", which is what happened. */
  it('marks it a follow-up so the recipient is told the truth', () => {
    expect(asks).toContain(
      "const isFollowUp = live.rows[0]?.status === 'answered' || ownerAddedSomething;",
    );
  });
});
