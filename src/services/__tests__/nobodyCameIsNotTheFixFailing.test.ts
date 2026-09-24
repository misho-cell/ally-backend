import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 229 — „NO REGISTRATION" HAS TWO READINGS AND THEY CALL FOR OPPOSITE
 * ACTIONS.
 *
 *   nobody came through a link at all   → send an invite; there is nothing to
 *                                         conclude about the fix at any price
 *   somebody came and was not credited  → the fix did not hold
 *
 * The Routine that runs `attribution.sh` says in its own words that the script
 * cannot tell them apart. It has said so since it was written, and the table
 * that answers it — `referral_link_events`, recording `issued`, `sent` and
 * `opened` — existed the whole time and was never asked.
 *
 * That is the same shape as the three weeks of silence the file was written
 * about: the evidence was in the database and nothing asked for it.
 *
 * Measured when the branch went in, 24 September: zero opens since 22
 * September and the last open anywhere was 15 September — so the fix is not
 * failing quietly, the funnel has not been entered. And widening the window to
 * 14 September shows SIX opens with no registration behind them, which is the
 * other branch, on real data.
 */
const attribution = readFileSync(
  join(__dirname, '..', '..', '..', 'scripts', 'ops', 'attribution.sh'),
  'utf8',
);

describe('it asks whether anybody even opened a link', () => {
  it('reads the link events, which it never used to', () => {
    expect(attribution).toContain('referral_link_events');
    expect(attribution).toContain("event = 'opened'");
  });

  it('says plainly when the funnel was never entered', () => {
    expect(attribution).toContain('NOBODY HAS OPENED A LINK EITHER');
  });

  /**
   * AND THE OPPOSITE CASE IS THE LOUD ONE. An open with no registration behind
   * it is the more interesting fact of the two, so it is marked and explained
   * rather than printed as a number.
   */
  it('shouts when somebody stood at the door and did not come in', () => {
    expect(attribution).toContain('INVITE LINK(S) WERE OPENED IN THAT WINDOW');
    expect(attribution).toContain('login takes no referral code');
  });

  /**
   * „I could not read the link events" is a THIRD fact. This file exists
   * because „could not look" and „looked and found nothing" were
   * indistinguishable for three weeks; the new branch must not reintroduce
   * that on its own line.
   */
  it('keeps “could not look” separate from “nobody came”', () => {
    expect(attribution).toContain('COULD NOT READ THE LINK EVENTS');
    expect(attribution).toContain('That is a third fact, not a reassurance.');
  });
});
