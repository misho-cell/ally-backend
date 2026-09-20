jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../contactExclusions', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../db/neo4j/client', () => ({ __esModule: true, getSession: jest.fn() }));
jest.mock('../mergedIdentities', () => ({
  __esModule: true,
  getCompositeKeyForUser: jest.fn().mockRejectedValue(new Error('no key')),
}));

import { query } from '../../../db/postgres/client';
import { searchContactsByCountry } from '../searchContactsByCountry';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

/**
 * A LEG THAT FAILED IS NOT A LEG THAT FOUND NOBODY.
 *
 * The other six search tools said those two things identically and were fixed
 * together (searchDidNotFinish). This one is shaped differently: the „who
 * could reach them" query is one of three legs feeding a composite answer, so
 * it cannot carry a reason of its own — it returned `[]` on failure, which the
 * caller then reported as „nobody".
 *
 * Seven calls in seven days and zero failures, while its sibling
 * `get_country_channels` failed three times out of six on statement timeouts.
 * „We will never see it" is the reasoning that let the introduction path die
 * for two weeks.
 */
describe('a country search whose reach leg did not run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('says the part is incomplete rather than reporting it empty', async () => {
    // Routed by SQL, not by call order: both queries start together inside one
    // Promise.all, so the order they are invoked in is not the order this file
    // lists them and a positional mock tests the harness rather than the code.
    mockQuery.mockImplementation((sql: string) =>
      sql.includes('reach_fact')
        ? Promise.reject(new Error('canceling statement due to statement timeout'))
        : (Promise.resolve(rows([{ name: 'Gio' }])) as never),
    );
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const out = (await searchContactsByCountry('42', 'Germany')) as Record<string, unknown>;

    expect(out.partial).toBe(true);
    expect(String(out.note)).toContain('DID NOT RUN');
    expect(String(out.note)).toContain('Do NOT tell the user nobody can reach anyone there');
    // The leg that DID run is still reported.
    expect(out.direct_contacts).toEqual([{ name: 'Gio' }]);
    spy.mockRestore();
  });

  it('says nothing about being partial when every leg ran', async () => {
    mockQuery.mockImplementation((sql: string) =>
      sql.includes('reach_fact')
        ? (Promise.resolve(rows([])) as never)
        : (Promise.resolve(rows([{ name: 'Gio' }])) as never),
    );

    const out = (await searchContactsByCountry('42', 'Germany')) as Record<string, unknown>;

    // An honestly empty reach list must not look like a failure.
    expect(out.partial).toBeUndefined();
    expect(out.note).toBeUndefined();
    expect(out.reach_contacts).toEqual([]);
  });
});
