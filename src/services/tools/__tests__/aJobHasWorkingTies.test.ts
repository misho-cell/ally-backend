import { tieWorkPatternFor } from '../jobTies';
import { buildExactMatchSql } from '../wordMatch';

/**
 * 5446 part (4), D792: from a person's own work, where they have working ties.
 * Tiko heads sales at a residential developer, so she is a way to the banks'
 * mortgage and developer-credit people. Run against Postgres 16 with every
 * migration on 17 Oct: for „TBC სესხი" the TBC contacts come first and Tiko
 * last with the soft hint and no job shown; a software developer never.
 */
describe('a working tie', () => {
  it('is read for a bank, loan or mortgage ask', () => {
    for (const ask of ['TBC სესხი', 'იპოთეკა', 'ბანკში კრედიტი', 'mortgage', 'BOG loan']) {
      expect(tieWorkPatternFor(ask)).toContain('უძრავ');
    }
  });

  it('is not read for an ask about something else', () => {
    expect(tieWorkPatternFor('სანტექნიკოსი')).toBeNull();
    expect(tieWorkPatternFor('a good dentist')).toBeNull();
  });

  it('never makes a software developer a way into a bank', () => {
    const pattern = new RegExp(tieWorkPatternFor('TBC სესხი') ?? '$^', 'u');
    expect(pattern.test('software developer')).toBe(false);
    expect(pattern.test('უძრავი ქონება, საცხოვრებელი კომპლექსები')).toBe(true);
  });
});

describe('the search with working ties', () => {
  const placeholders = (sql: string): number =>
    Math.max(...[...sql.matchAll(/\$(\d+)/gu)].map((m) => Number(m[1])));

  it('binds every placeholder, block list last', () => {
    const m = buildExactMatchSql('7', [['tbc'], ['სესხ']], ['+1'], true, 'უძრავ|broker');
    expect(placeholders(`${m.matchedCte} ${m.totalSql}`)).toBe(m.params.length);
    expect(m.blockIdx).toBe(m.params.length);
    expect(m.params).toContain('უძრავ|broker');
    expect(m.matchedCte).toContain("kv.key IN ('profession', 'industry')");
  });

  it('is the same search as before without a tie or outside the own-work search', () => {
    const before = buildExactMatchSql('7', [['tbc']], [], true);
    const withNoTie = buildExactMatchSql('7', [['tbc']], [], true, null);
    expect(withNoTie.matchedCte).toBe(before.matchedCte);
    expect(withNoTie.params).toEqual(before.params);
    const notOwnWork = buildExactMatchSql('7', [['tbc']], [], false, 'უძრავ');
    expect(notOwnWork.params).not.toContain('უძრავ');
    expect(placeholders(`${notOwnWork.matchedCte} ${notOwnWork.totalSql}`)).toBe(
      notOwnWork.params.length,
    );
  });
});
