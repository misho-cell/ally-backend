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
import { searchByTag } from '../searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;

const mockRow = {
  phone: '+995555123456',
  name: 'ნინო',
  all_tags: ['engineer', 'tbilisi'],
  city: 'Tbilisi',
  jobPosition: 'Engineer',
  employer: 'Bank of Georgia',
};

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

// searchByTag now fires the main page and a real COUNT in parallel, then a
// facts-enrichment query — route by SQL fragment so any call order is safe.
function setup(opts: {
  main?: unknown[];
  count?: number;
  facts?: unknown[];
  fuzzy?: unknown[];
}): void {
  const main = opts.main ?? [];
  const count = opts.count ?? main.length;
  const facts = opts.facts ?? [];
  const fuzzy = opts.fuzzy ?? [];
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('COUNT(DISTINCT'))
      return Promise.resolve(rows([{ total: String(count) }]) as never);
    if (sql.includes('FROM contact_facts')) return Promise.resolve(rows(facts) as never);
    if (sql.includes('FROM "UserPhone"')) return Promise.resolve(rows([]) as never); // membership
    if (sql.includes('similarity(')) return Promise.resolve(rows(fuzzy) as never); // normalized fuzzy pass
    return Promise.resolve(rows(main) as never); // exact page
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchByTag', () => {
  it('returns results when tag matches', async () => {
    setup({ main: [mockRow], count: 1 });

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    expect(result.total).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBe('ნინო');
    expect(results[0].tags).toContain('engineer');
  });

  it('passes userId, word-start regex + LIKE arrays, per-group regex, and blocked (Latin)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'Engineer');

    // $1 userId, $2 all word-start regexes, $3 all %term% LIKE patterns,
    // $4 per-group regex (one group here), last = blocked phones.
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '42',
      ['\\mengineer'],
      ['%engineer%'],
      ['\\mengineer'],
      [],
    ]);
  });

  it('passes Georgian term, transliteration and drift variants as regex + LIKE patterns', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'ინჟინერი');

    // ჟ → "zh" canonical, drift "zh" → "j".
    const regex = ['\\mინჟინერი', '\\minzhineri', '\\minjineri'];
    const like = ['%ინჟინერი%', '%inzhineri%', '%injineri%'];
    expect(mockQuery.mock.calls[0][1]).toEqual(['42', regex, like, regex, []]);
  });

  it('passes the COUNT query only the parameters it references (no unused per-group params)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'dachi axel');

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

  it('drops a sub-trigram token ("2") from the LIKE candidates but keeps it for ranking', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'Radiatori 2');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    // $2 all regexes (both words), $3 LIKE candidates (only the >=3-char word),
    // $4/$5 per-group regex — "2" ranks via word_hits but never drives the scan.
    expect(params[1]).toEqual(['\\mradiatori', '\\m2']);
    expect(params[2]).toEqual(['%radiatori%']); // no '%2%' → no seq-scan
    expect(params[3]).toEqual(['\\mradiatori']);
    expect(params[4]).toEqual(['\\m2']);
  });

  it('reports the real total even when the page is capped', async () => {
    setup({ main: [mockRow], count: 52 });

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;

    expect(result.total).toBe(52);
  });

  it('returns null name when no alias or registered name', async () => {
    setup({ main: [{ ...mockRow, name: null }], count: 1 });

    const result = (await searchByTag('42', 'tbilisi')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].name).toBeNull();
  });

  it('returns found: false when no matches', async () => {
    setup({ main: [], count: 0 });

    const result = (await searchByTag('42', 'xyzzy')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.query).toBe('xyzzy');
  });

  it('returns found: false with error on DB failure', async () => {
    mockQuery.mockRejectedValue(new Error('connection lost') as never);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = (await searchByTag('42', 'test')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(result.error).toBe('connection lost');
    consoleSpy.mockRestore();
  });

  it('filters null values from tags array', async () => {
    setup({ main: [{ ...mockRow, all_tags: [null, 'engineer'] }], count: 1 });

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;

    const results = result.results as Array<Record<string, unknown>>;
    expect((results[0].tags as string[]).every(Boolean)).toBe(true);
  });

  it("matches AGGREGATED labels on the user's own contacts — tags AND aliases (Bug 1 / 1.3b)", async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'asriyants');

    const mainSql = mockQuery.mock.calls.find(
      (c) =>
        !(c[0] as string).includes('COUNT(DISTINCT') && !(c[0] as string).includes('similarity('),
    )?.[0] as string;
    // Recall is scoped to the user's own contact phones (the "mine" set)...
    expect(mainSql).toContain('SELECT phone FROM "UserTags"  WHERE "contactId" = $1');
    expect(mainSql).toContain('phone IN (SELECT phone FROM mine)');
    // ...and matches tag AND alias, with the alias candidate coming from an
    // index-backed trigram LIKE, so an alias-only contact (no tags) surfaces.
    expect(mainSql).toContain('LOWER(t.tag) AS label');
    expect(mainSql).toContain('LOWER(a.alias) AS label');
    expect(mainSql).toContain('LOWER(a.alias) LIKE ANY($3)');
    expect(mainSql).toContain('LOWER(t.tag) ~ ANY($2)');
    expect(mainSql).toContain('array_agg(DISTINCT ut.tag)');
    expect(mainSql).not.toContain('ut."contactId" = $1');
  });

  it('ranks a two-word query by how many distinct words each contact matched (Bug 2)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'dachi axel');

    const mainSql = mockQuery.mock.calls.find(
      (c) =>
        !(c[0] as string).includes('COUNT(DISTINCT') && !(c[0] as string).includes('similarity('),
    )?.[0] as string;
    const mainParams = mockQuery.mock.calls.find(
      (c) =>
        !(c[0] as string).includes('COUNT(DISTINCT') && !(c[0] as string).includes('similarity('),
    )?.[1] as unknown[];
    // Each word becomes a bool_or group; word_hits sums them and drives the order.
    expect(mainSql).toContain('bool_or(');
    expect(mainSql).toContain(') AS word_hits');
    expect(mainSql).toContain('ORDER BY MAX(h.word_hits) DESC');
    // Both words' patterns are passed as separate per-group regex arrays
    // ($4, $5) so word_hits counts the intersection, not a single OR term.
    const hasInGroup = (needle: string): boolean =>
      mainParams.some((p) => Array.isArray(p) && (p as string[]).includes(needle));
    expect(hasInGroup('\\mdachi')).toBe(true);
    expect(hasInGroup('\\maxel')).toBe(true);
  });

  it("marks direct ownership and surfaces the user's own saved_as label (Bug 1.1)", async () => {
    setup({ main: [{ ...mockRow, saved_as: 'ჩემი კლასელი' }], count: 1 });

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;
    const r = (result.results as Array<Record<string, unknown>>)[0];
    expect(r.ownership).toBe('direct');
    expect(r.saved_as).toBe('ჩემი კლასელი');
  });

  it('marks is_member true for a contact that is a registered Ally user', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(DISTINCT')) return Promise.resolve(rows([{ total: '1' }]) as never);
      if (sql.includes('FROM contact_facts')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve(rows([{ phone: mockRow.phone }]) as never); // member
      if (sql.includes('similarity(')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([mockRow]) as never);
    });

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].is_member).toBe(true);
  });

  it('marks is_member false when the contact is not a registered user', async () => {
    setup({ main: [mockRow], count: 1 }); // membership route returns []

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].is_member).toBe(false);
  });

  it('unions the fuzzy pass and flags fuzzy-only rows approximate', async () => {
    // Exact finds the "buralteri" spelling; the normalized fuzzy pass surfaces
    // the "bugalteri" spelling of the same word as a separate contact.
    setup({
      main: [{ ...mockRow, phone: '+995500000001', name: 'Exact' }],
      count: 1,
      fuzzy: [{ ...mockRow, phone: '+995500000002', name: 'Approx' }],
    });

    const result = (await searchByTag('42', 'buralteri')) as Record<string, unknown>;
    const results = result.results as Array<Record<string, unknown>>;

    expect(result.count).toBe(2);
    expect(results[0].name).toBe('Exact');
    expect(results[0].approximate).toBeUndefined();
    expect(results[1].name).toBe('Approx');
    expect(results[1].approximate).toBe(true);
    expect(result.fuzzy).toBeUndefined(); // mixed result — not wholly approximate
  });

  it('drops a fuzzy hit that duplicates an exact hit (same phone)', async () => {
    setup({
      main: [{ ...mockRow, phone: '+995500000001', name: 'Exact' }],
      count: 1,
      fuzzy: [{ ...mockRow, phone: '+995500000001', name: 'Dup' }],
    });

    const result = (await searchByTag('42', 'buralteri')) as Record<string, unknown>;

    expect(result.count).toBe(1);
    expect((result.results as Array<Record<string, unknown>>)[0].name).toBe('Exact');
  });

  it('marks the whole result fuzzy when only the fuzzy pass matches', async () => {
    setup({ main: [], count: 0, fuzzy: [{ ...mockRow, name: 'Only fuzzy' }] });

    const result = (await searchByTag('42', 'buhalteri')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.fuzzy).toBe(true);
    expect((result.results as Array<Record<string, unknown>>)[0].approximate).toBe(true);
  });

  it('still returns exact rows when the fuzzy pass errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(DISTINCT')) return Promise.resolve(rows([{ total: '1' }]) as never);
      if (sql.includes('FROM contact_facts')) return Promise.resolve(rows([]) as never);
      if (sql.includes('similarity(')) return Promise.reject(new Error('index missing'));
      return Promise.resolve(rows([mockRow]) as never);
    });

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;

    expect(result.found).toBe(true);
    expect(result.count).toBe(1);
    consoleSpy.mockRestore();
  });

  it('overlays employer/occupation from saved facts when present', async () => {
    setup({
      main: [{ ...mockRow, employer: null, jobPosition: null }],
      count: 1,
      facts: [
        { phone: '+995555123456', field_type: 'employer', value: 'MKD Law' },
        { phone: '+995555123456', field_type: 'occupation', value: 'Senior Associate' },
      ],
    });

    const result = (await searchByTag('42', 'engineer')) as Record<string, unknown>;
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].employer).toBe('MKD Law');
    expect(results[0].jobPosition).toBe('Senior Associate');
  });
});
