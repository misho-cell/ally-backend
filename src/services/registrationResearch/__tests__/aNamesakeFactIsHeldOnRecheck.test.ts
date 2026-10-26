const mockQuery = jest.fn();
const mockIdentity = jest.fn();
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('../identity', () => ({
  __esModule: true,
  identityFor: (...a: unknown[]) => mockIdentity(...a),
}));

import { factsWithoutIdentity, recheckStoredResearch } from '../factRecheck.service';

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
      .mockResolvedValueOnce({ rows: facts });
    mockIdentity.mockResolvedValueOnce({ searchName: 'Giorgi Maisuradze', words: ['ugt'] });
    const report = await recheckStoredResearch(true);
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
      .mockResolvedValueOnce({ rows: facts })
      .mockResolvedValueOnce({ rowCount: 1 });
    mockIdentity.mockResolvedValueOnce({ searchName: 'Giorgi Maisuradze', words: ['ugt'] });
    expect((await recheckStoredResearch(false)).facts_held_possible).toBe(1);
    const [sql, params] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain('UPDATE contact_facts SET research_status = $2');
    expect(sql).not.toContain('DELETE');
    expect(params[0]).toEqual([1]);
    expect(params[1]).toBe('possible');
  });
});
