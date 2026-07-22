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

  it('passes regex + LIKE arrays and per-group regex for a Georgian term', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchContactByName('42', 'გიო');

    // $1 userId, $2 all regexes, $3 all %term% LIKE, $4 per-group regex, last = blocked.
    const regex = ['\\mგიო', '\\mgio'];
    const like = ['%გიო%', '%gio%'];
    expect(mockQuery.mock.calls[0][1]).toEqual(['42', regex, like, regex, []]);
  });

  it('passes one word-start pattern for a Latin query (no transliteration)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchContactByName('42', 'George');

    expect(mockQuery.mock.calls[0][1]).toEqual([
      '42',
      ['\\mgeorge'],
      ['%george%'],
      ['\\mgeorge'],
      [],
    ]);
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

  it("matches a contact by ANY label — alias, registered name, or tag — on the user's own contacts (Bug 1)", async () => {
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
    // ...and matches alias, registered name, AND tag, with alias/name candidates
    // from an index-backed trigram LIKE, so a surname or nickname another
    // contributor saved — even a tag, not the display name — surfaces the contact.
    expect(mainSql).toContain('LOWER(a.alias) AS label');
    expect(mainSql).toContain('LOWER(t.tag) AS label');
    expect(mainSql).toContain('LOWER(a.alias) LIKE ANY($3)');
    expect(mainSql).toContain('LOWER(t.tag) ~ ANY($2)');
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
    const hasInGroup = (needle: string): boolean =>
      mainParams.some((p) => Array.isArray(p) && (p as string[]).includes(needle));
    expect(hasInGroup('\\mdachi')).toBe(true);
    expect(hasInGroup('\\maxel')).toBe(true);
  });

  it('passes the COUNT query only the parameters it references (no unused per-group params)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchContactByName('42', 'Dachi Axel');

    const countCall = mockQuery.mock.calls.find((c) => (c[0] as string).includes('COUNT(DISTINCT'));
    const countSql = countCall?.[0] as string;
    const countParams = countCall?.[1] as unknown[];
    // Postgres rejects a bind carrying parameters the statement never uses
    // ("could not determine data type of parameter $4") — the count query must
    // carry exactly $1 userId, $2 regex[], $3 like[], $4 blocked.
    expect(countParams).toHaveLength(4);
    expect(countSql).toContain('ALL($4)');
    expect(countParams?.[0]).toBe('42');
    expect(countParams?.[3]).toEqual([]);
  });

  it("marks direct ownership and surfaces the user's own saved_as label (Bug 1.1)", async () => {
    setup({ main: [{ ...mockRow, saved_as: 'კლასელი' }], count: 1 });

    const result = (await searchContactByName('42', 'გიო')) as Record<string, unknown>;
    const r = (result.results as Array<Record<string, unknown>>)[0];
    expect(r.ownership).toBe('direct');
    expect(r.saved_as).toBe('კლასელი');
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
