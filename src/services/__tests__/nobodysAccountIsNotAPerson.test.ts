import { readFileSync } from 'fs';
import { join } from 'path';
import { notATestSeat } from '../testSeatCreate.service';

/**
 * „THIS ACCOUNT BELONGS TO NOBODY" — ONE DEFINITION, AND THE PLACES THAT ASK.
 *
 * Measured 23 September, hours after the seat-creation route shipped:
 *
 *     accounts with an ACTIVE subscription        41
 *       of them fictional seats                   20     ← 49%
 *
 * Half of every pool, count and ranking built on „active" belonged to nobody,
 * and it grew by one each time a seat was made. „41 active users" is 21.
 */
describe('the definition', () => {
  it('asks the table and nothing else', () => {
    expect(notATestSeat('u.id')).toBe(
      'NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)',
    );
  });

  /**
   * NOT AN ID RANGE AND NOT A PHONE PREFIX, and this is the whole care in it.
   *
   * „171870 to 171941" reads as the eleven original seats and CONTAINS 171903
   * — a real person's account, a Georgian name on a +995 number, inside the
   * range only because of when it was created. A filter on the range would
   * have removed a human being from the product the day they subscribed, with
   * nothing on any screen to say so.
   *
   * The +1202555 prefix is the same mistake in better clothes: true of every
   * seat, and still a property the data happens to have rather than a list
   * somebody wrote.
   */
  it('guesses from nothing', () => {
    const sql = notATestSeat('u.id');
    expect(sql).not.toContain('171870');
    expect(sql).not.toContain('1202555');
    expect(sql).not.toContain('BETWEEN');
    expect(sql).not.toContain('LIKE');
  });
});

/**
 * THE PLACES THAT ASK IT, NAMED ONE BY ONE — this project's most frequent
 * fault is the rule on one wire while the other keeps running, and a shared
 * helper does not fix that by existing.
 */
describe('the reads that must not count nobody as somebody', () => {
  it.each([
    // Queues a QUESTION to a person. The strongest reason of the three.
    ['warmth.service.ts', 'warm-tie questions'],
    // A fatigue histogram half made of nobody is a figure a person reads.
    ['labReport.service.ts', 'the fatigue report'],
    // Chooses who is asked to invite somebody.
    ['chorusCampaign.service.ts', 'the campaign inviter'],
  ])('%s — %s', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(source).toContain("notATestSeat('u.id')");
  });

  /** And the inviter pool, which had its own fix before the helper existed. */
  it('targetScoring keeps seats out of the askable inviters', () => {
    const scoring = readFileSync(join(__dirname, '..', 'targetScoring.service.ts'), 'utf8');
    const at = scoring.indexOf('async function askableInviterIds');
    expect(scoring.slice(at, at + 2600)).toContain(
      'NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)',
    );
  });
});

/**
 * AND ONE READ THAT DELIBERATELY DOES NOT ASK, so „it was forgotten" and „it
 * was decided" are not the same silence.
 *
 * `basePool` walks every account there is — 62,227 of them, 20 fictional — to
 * inventory what exists. The seats DO exist, so leaving them out would make
 * that inventory wrong in the other direction. 0.03% is not a ranking anyway.
 */
describe('and one that is left alone on purpose', () => {
  it('basePool counts what exists, including the seats', () => {
    const pool = readFileSync(join(__dirname, '..', 'basePool.service.ts'), 'utf8');
    expect(pool).not.toContain('notATestSeat');
  });
});
