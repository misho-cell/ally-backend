const mockQuery = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import {
  factsWithoutIdentity,
  recheckStoredResearch,
  wordsSavedByMany,
} from '../factRecheck.service';

beforeEach(() => jest.resetAllMocks());

/** #7727: members save Giorgi Maisuradze as „UGT"; research gave another Giorgi's company. */
describe('a namesake fact is held as possible on re-check', () => {
  const facts = [
    { id: 1, value: 'Founder (FNDR) - the company behind Bebi Family' },
    { id: 2, value: 'Vice President, UGT Group' },
  ];

  it('picks only the facts that hold none of the words members saved', () => {
    expect(factsWithoutIdentity(facts, ['ugt'])).toEqual([1]);
    expect(factsWithoutIdentity(facts, [])).toEqual([]);
  });

  it('counts on a dry run and writes nothing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 191076, name: 'Giorgi Maisuradze' }] })
      .mockResolvedValueOnce({
        rows: [
          { saver: 501, alias: 'Giorgi Maisuradze UGT' },
          { saver: 523, alias: 'Gio UGT' },
        ],
      })
      .mockResolvedValueOnce({ rows: facts });
    const report = await recheckStoredResearch(true, [191076]);
    expect(report).toEqual({
      dry_run: true,
      users_read: 1,
      users_with_identity: 1,
      facts_held_possible: 1,
    });
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('holds them as possible on a real run, research facts only, nothing deleted', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 191076, name: 'Giorgi Maisuradze' }] })
      .mockResolvedValueOnce({
        rows: [
          { saver: 501, alias: 'Giorgi Maisuradze UGT' },
          { saver: 523, alias: 'Gio UGT' },
        ],
      })
      .mockResolvedValueOnce({ rows: facts })
      .mockResolvedValueOnce({ rowCount: 1 });
    expect((await recheckStoredResearch(false, [191076])).facts_held_possible).toBe(1);
    const [sql, params] = mockQuery.mock.calls[3] as [string, unknown[]];
    expect(sql).toContain('UPDATE contact_facts SET research_status = $2');
    expect(sql).not.toContain('DELETE');
    expect(params[0]).toEqual([1]);
    expect(params[1]).toBe('possible');
  });

  it('counts as identity only a word two different members saved', () => {
    const words = wordsSavedByMany(
      [
        { saver: 501, alias: 'Giorgi Maisuradze UGT' },
        { saver: 523, alias: 'Giorgi UGT ძმა' },
      ],
      'Giorgi Maisuradze',
    );
    expect(words).toEqual(['ugt']);
  });

  it('holds every research fact of a named namesake case nobody labelled (#7726)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 190746, name: 'Giorgi' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: facts });
    const report = await recheckStoredResearch(true, [190746]);
    expect(report.facts_held_possible).toBe(2);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toEqual([190746]);
  });
});
