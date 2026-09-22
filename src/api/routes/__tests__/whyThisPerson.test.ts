/**
 * ROW 40's SECOND COLUMN — „why THIS person", and the reason was being computed
 * and then thrown away.
 *
 * The row asks each line of the review screen to show WHO, WHY THEM, WHO
 * INVITES and WHAT YOU HAVE IN COMMON. My own note on the board proposed
 * filling „why them" from the campaign's `target_label` and `city`. Reading
 * `scheduleParticipants` killed that: those describe the CAMPAIGN, so every
 * participant of one campaign carries the same sentence. It answers „what is
 * this campaign looking for", not „why this person".
 *
 * The real reason is `contact_relationship_scores.strength_score` — candidates
 * are ordered by it, `DESC NULLS LAST`, and the top `dial` are taken. The
 * INSERT stores four columns and that number is not one of them.
 *
 * Of the 85 pending participants, 35 have a score and FIFTY HAVE NONE. Those
 * fifty are not missing data: `NULLS LAST` means a candidate with no measured
 * tie is still eligible and is taken when there are not enough scored ones.
 * That is the distinction a founder approving targets most needs, and it is
 * what these tests hold.
 */
jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { whyThisPerson } from '../admin.routes';

describe('why this person was chosen', () => {
  it('names the number that actually decided it', () => {
    expect(whyThisPerson(0.95)).toContain('0.95');
    expect(whyThisPerson(0.95)).toContain('strongest first');
  });

  /**
   * FIFTY OF EIGHTY-FIVE. A blank here would read as „we have not looked",
   * which is the opposite of the truth: we looked, there was nothing, and the
   * person was scheduled anyway.
   */
  it('says plainly that there was no tie, rather than going quiet', () => {
    const said = whyThisPerson(null);

    expect(said).toContain('No measured tie');
    expect(said).toContain('dial had room');
  });

  /**
   * A zero score is a MEASURED zero and a null is the absence of a measurement.
   * Collapsing them would hide exactly the fifty rows this exists to surface —
   * and `0` is falsy, which is how that collapse usually arrives.
   */
  it('does not treat a measured zero as no measurement', () => {
    expect(whyThisPerson(0)).toContain('0');
    expect(whyThisPerson(0)).not.toContain('No measured tie');
  });

  /** It is a reason, not a verdict: nothing here tells the founder what to do. */
  it('recommends nothing', () => {
    for (const said of [whyThisPerson(0.95), whyThisPerson(null), whyThisPerson(0.4)]) {
      expect(said.toLowerCase()).not.toContain('approve');
      expect(said.toLowerCase()).not.toContain('should');
      expect(said.toLowerCase()).not.toContain('recommend');
    }
  });
});
