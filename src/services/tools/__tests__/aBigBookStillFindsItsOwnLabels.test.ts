jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../researchFactsView', () => ({
  ...jest.requireActual('../../researchFactsView'),
  researchFactsForPhones: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { OWN_LABELS_ONLY_NOTE, searchByTag } from '../searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;
const TIMEOUT = new Error('canceling statement due to statement timeout');
const OWN_LABELS_SQL = 'WHERE a."contactId" = $1 AND';
const SAVED_AS_ICOM = {
  phone: '+995555000111',
  name: 'Amanda ICOM',
  saved_as: 'Amanda ICOM',
  all_tags: [],
  own_tags: [],
  employer: null,
  jobPosition: null,
  city: null,
};

const rows = (data: unknown[]): never => ({ rows: data, rowCount: data.length }) as never;

/** The full search runs out of time; the owner's own labels answer `own`. */
function fullSearchTimesOut(own: () => Promise<never>): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('AS total_matches')) return Promise.reject(TIMEOUT);
    if (sql.includes(OWN_LABELS_SQL)) return own();
    return Promise.resolve(rows([]));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/**
 * Nana, 22 Oct (thread 63429): 6,597 contacts, seven saved with „ICOM" in the
 * name, and the search for „ICOM" ran out of time three times and came back
 * empty. The people she saved under the word are still read.
 */
describe('a search that runs out of time on a big phonebook', () => {
  it('still finds the people the owner saved under the word', async () => {
    fullSearchTimesOut(() => Promise.resolve(rows([SAVED_AS_ICOM])));

    const result = (await searchByTag('42', 'ICOM')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect((result.results as Array<{ name: string }>)[0]?.name).toBe('Amanda ICOM');
    expect(result.partial_note).toBe(OWN_LABELS_ONLY_NOTE);
  });

  it('reads only the owner’s own labels and tags, by her id', async () => {
    fullSearchTimesOut(() => Promise.resolve(rows([SAVED_AS_ICOM])));

    await searchByTag('42', 'ICOM');

    const own = mockQuery.mock.calls.find(([sql]) => String(sql).includes(OWN_LABELS_SQL));
    expect(own).toBeDefined();
    const [sql, params] = own as unknown as [string, unknown[]];
    expect(sql).toContain('t."contactId" = $1');
    expect(sql).not.toContain('CROSS JOIN LATERAL');
    expect(params[0]).toBe('42');
  });

  it('still says the search did not finish when her own labels hold nobody', async () => {
    fullSearchTimesOut(() => Promise.resolve(rows([])));

    const result = (await searchByTag('42', 'ICOM')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.reason).toBe('search_timed_out');
  });

  it('a search that finishes carries no partial note', async () => {
    mockQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('AS total_matches')
          ? rows([{ ...SAVED_AS_ICOM, total_matches: '1' }])
          : rows([]),
      ),
    );

    const result = (await searchByTag('42', 'ICOM')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.partial_note).toBeUndefined();
  });
});
