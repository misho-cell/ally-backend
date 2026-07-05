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
function setup(opts: { main?: unknown[]; count?: number; facts?: unknown[] }): void {
  const main = opts.main ?? [];
  const count = opts.count ?? main.length;
  const facts = opts.facts ?? [];
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('COUNT(DISTINCT'))
      return Promise.resolve(rows([{ total: String(count) }]) as never);
    if (sql.includes('FROM contact_facts')) return Promise.resolve(rows(facts) as never);
    if (sql.includes('similarity(')) return Promise.resolve(rows([]) as never); // fuzzy fallback
    return Promise.resolve(rows(main) as never); // main page
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

  it('passes userId and a word-start pattern to the main query (Latin — no transliteration)', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'Engineer');

    expect(mockQuery.mock.calls[0][1]).toEqual(['42', '\\mengineer', []]);
  });

  it('passes Georgian term, transliteration and drift variant as word-start patterns', async () => {
    setup({ main: [mockRow], count: 1 });

    await searchByTag('42', 'ინჟინერი');

    // ჟ → "zh" canonical, drift "zh" → "j".
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '42',
      '\\mინჟინერი',
      '\\minzhineri',
      '\\minjineri',
      [],
    ]);
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
