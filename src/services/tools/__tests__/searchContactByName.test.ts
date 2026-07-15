jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

// Block filtering issues its own query; stub it so the `query` mock below
// only sees the search calls (keeps call-arg assertions on index 0).
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { searchContactByName } from '../searchContactByName';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  phone: '+995555123456',
  name: 'გიორგი',
  all_tags: ['georgia', 'tbilisi'],
  city: 'Tbilisi',
  jobPosition: 'Engineer',
  employer: 'TBC Bank',
};

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

// Name search now fires the main page and a real COUNT in parallel, then a
// facts-enrichment query — route by SQL fragment so any call order is safe.
function setup(opts: { main?: unknown[]; count?: number; facts?: unknown[] }): void {
  const main = opts.main ?? [];
  const count = opts.count ?? main.length;
  const facts = opts.facts ?? [];
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('COUNT(DISTINCT'))
      return Promise.resolve(rows([{ total: String(count) }]) as never);
    if (sql.includes('FROM contact_facts')) return Promise.resolve(rows(facts) as never);
    if (sql.includes('word_similarity(')) return Promise.resolve(rows([]) as never); // fuzzy fallback
    return Promise.resolve(rows(main) as never); // main page
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchContactByName', () => {
  it('returns found: true with results on match', async () => {
    setup({ main: [mockRow], count: 1 });

    const result = (await searchContactByName('42', 'გიორგი')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('გიორგი');
    expect(results[0].city).toBe('Tbilisi');
    expect(results[0].employer).toBe('TBC Bank');
  });

  it('passes Georgian term and transliteration as word-start patterns to the main query', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchContactByName('42', 'გიო');

    expect(mockQuery.mock.calls[0][1]).toEqual(['42', '\\mგიო', '\\mgio', []]);
  });

  it('passes one word-start pattern for a Latin query (no transliteration)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchContactByName('42', 'George');

    expect(mockQuery.mock.calls[0][1]).toEqual(['42', '\\mgeorge', []]);
  });

  it('returns null name when no alias or registered name', async () => {
    setup({ main: [{ ...mockRow, name: null }], count: 1 });

    const result = (await searchContactByName('42', 'გიო')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBeNull();
  });

  it('returns found: false when no matches', async () => {
    setup({ main: [], count: 0 });

    const result = (await searchContactByName('42', 'unknown')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('unknown');
  });

  it('returns found: false with error message on DB failure', async () => {
    mockQuery.mockRejectedValue(new Error('DB error') as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchContactByName('42', 'test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('DB error');
    consoleSpy.mockRestore();
  });

  it('filters null values from tags array', async () => {
    setup({ main: [{ ...mockRow, all_tags: [null, 'tbilisi'] }], count: 1 });

    const result = (await searchContactByName('42', 'გიო')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect((results[0].tags as string[]).every(Boolean)).toBe(true);
  });

  it("matches ANY contributor's alias on the user's own contacts, not only the label they saved (Bug 1)", async () => {
    setup({ main: [mockRow], count: 1 });

    await searchContactByName('42', 'Jojua');

    const mainSql = mockQuery.mock.calls.find(
      (c) =>
        !(c[0] as string).includes('COUNT(DISTINCT') &&
        !(c[0] as string).includes('word_similarity('),
    )?.[0] as string;
    // Recall is scoped to the user's own contact phones (the "mine" set)...
    expect(mainSql).toContain('SELECT phone FROM "UserTags"  WHERE "contactId" = $1');
    expect(mainSql).toContain('a.phone IN (SELECT phone FROM mine)');
    // ...but the alias/name match runs over every contributor's alias on those
    // phones, so a surname another contributor saved surfaces the contact.
    expect(mainSql).toContain('LOWER(a.alias) ~ $2');
  });

  it('ranks a two-word name by how many distinct words each contact matched (Bug 2)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchContactByName('42', 'Dachi Axel');

    const mainCall = mockQuery.mock.calls.find(
      (c) =>
        !(c[0] as string).includes('COUNT(DISTINCT') &&
        !(c[0] as string).includes('word_similarity('),
    );
    const mainSql = mainCall?.[0] as string;
    const mainParams = mainCall?.[1] as unknown[];
    expect(mainSql).toContain('bool_or(');
    expect(mainSql).toContain(') AS word_hits');
    expect(mainSql).toContain('ORDER BY MAX(h.word_hits) DESC');
    expect(mainParams).toContain('\\mdachi');
    expect(mainParams).toContain('\\maxel');
  });

  it('fills employer/occupation from saved facts when the join fields are empty', async () => {
    setup({
      main: [{ ...mockRow, employer: '', jobPosition: '', city: null }],
      count: 1,
      facts: [
        { phone: '+995555123456', field_type: 'employer', value: 'MKD Law' },
        { phone: '+995555123456', field_type: 'city', value: 'Batumi' },
      ],
    });

    const result = (await searchContactByName('42', 'გიო')) as Record<string, unknown>;
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].employer).toBe('MKD Law');
    expect(results[0].city).toBe('Batumi');
  });
});
