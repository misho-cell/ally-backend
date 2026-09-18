jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { clearOrgWordCache, orgWordStats } from '../labelReader.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const rows = (found: Record<string, [number, number]>): { rows: unknown[] } => ({
  rows: Object.entries(found).map(([word, [carriers, leads]]) => ({
    word,
    carriers: String(carriers),
    leads: String(leads),
  })),
});

/** The words the last call actually sent to the database. */
const askedIn = (call: number): string[] =>
  (mockQuery.mock.calls[call]?.[1] as string[][])[0] as unknown as string[];

/**
 * Row 108, fifth cut. This query was the flat cost of every second-degree
 * search — the per-lookup timings shipped in 69e43e2 put `labels` at the top of
 * all five lookups in every line, and within milliseconds of the whole phase:
 *
 *   decorate: touched 164 / states 229 / excl 450 / signal 641 / labels 1629
 *   decorate: touched 149 / states 198 / excl 441 / signal 620 / labels 1203
 *
 * On the live base it is 586 ms for 20 words and 1,020 ms for 40, because each
 * word joins the 8.4M-row UserAlias on a leading-wildcard LIKE plus a regex.
 *
 * What it answers does not change between two searches a minute apart: these
 * are corpus statistics about the whole base, not about the search.
 */
describe('the org-word counts are asked once, not once per search', () => {
  beforeEach(() => {
    clearOrgWordCache();
    mockQuery.mockReset();
  });

  it('does not go back to the database for a word it has already counted', async () => {
    mockQuery.mockResolvedValue(rows({ tbc: [6256, 2340] }) as never);

    const first = await orgWordStats(['tbc']);
    const second = await orgWordStats(['tbc']);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(second.get('tbc')).toEqual(first.get('tbc'));
    expect(second.get('tbc')?.carriers).toBe(6256);
  });

  it('asks only for the words it is missing, not the whole list again', async () => {
    mockQuery.mockResolvedValueOnce(rows({ tbc: [6256, 2340] }) as never);
    await orgWordStats(['tbc']);

    mockQuery.mockResolvedValueOnce(rows({ bank: [2401, 181] }) as never);
    const out = await orgWordStats(['tbc', 'bank']);

    expect(askedIn(1)).toEqual(['bank']);
    // And the cached one is still in the answer, which is the point.
    expect(out.get('tbc')?.carriers).toBe(6256);
    expect(out.get('bank')?.carriers).toBe(2401);
  });

  it('remembers a word the base had nothing for, because that scan cost the same', async () => {
    // Caching only the hits would leave exactly the expensive half uncached: a
    // word the join finds nothing for pays the whole sweep to find out.
    mockQuery.mockResolvedValue(rows({}) as never);

    await orgWordStats(['zzzqq']);
    const second = await orgWordStats(['zzzqq']);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(second.has('zzzqq')).toBe(false);
  });

  it('skips the database entirely when every word is known', async () => {
    mockQuery.mockResolvedValueOnce(rows({ tbc: [6256, 2340], bank: [2401, 181] }) as never);
    await orgWordStats(['tbc', 'bank']);

    await orgWordStats(['bank', 'tbc']);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failure as an answer', async () => {
    // A timeout must be retried on the next search, not cached as „nothing".
    // The write happens after the query returns, so a throw leaves no entry.
    mockQuery.mockRejectedValueOnce(new Error('statement timeout'));
    await expect(orgWordStats(['tbc'])).rejects.toThrow('statement timeout');

    mockQuery.mockResolvedValueOnce(rows({ tbc: [6256, 2340] }) as never);
    const out = await orgWordStats(['tbc']);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(out.get('tbc')?.carriers).toBe(6256);
  });

  it('asks each word once even when the caller repeats it', async () => {
    mockQuery.mockResolvedValueOnce(rows({ tbc: [6256, 2340] }) as never);

    await orgWordStats(['tbc', 'tbc', 'tbc']);

    expect(askedIn(0)).toEqual(['tbc']);
  });

  it('still refuses a word that cannot go into a regex', async () => {
    // Unchanged by the cache, and worth holding: the word is interpolated into
    // the query's own regex, so only plain words are ever asked about.
    mockQuery.mockResolvedValue(rows({}) as never);

    await orgWordStats(['tbc-bank', 'a.b']);

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
