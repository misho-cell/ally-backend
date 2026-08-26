jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { findUnmetNeeds } from '../unmetNeeds.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findUnmetNeeds', () => {
  it('returns no topics when nothing failed', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await findUnmetNeeds(30);

    expect(out).toEqual([]);
  });

  it('attaches non-member candidates matched by tag or alias, per failed topic', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM search_activity'))
        return Promise.resolve(
          rows([{ query: 'Wissol manager', ask_count: '3', city: 'თბილისი' }]) as never,
        );
      if (sql.includes('FROM "UserTags"'))
        return Promise.resolve(rows([{ phone: '+995500000001', tag: 'Wissol' }]) as never);
      if (sql.includes('FROM "UserAlias"'))
        return Promise.resolve(
          rows([{ phone: '+995500000002', alias: 'Wissol მენეჯერი' }]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const out = await findUnmetNeeds(30);

    expect(out).toEqual([
      {
        query: 'Wissol manager',
        ask_count: 3,
        city: 'თბილისი',
        candidates: expect.arrayContaining([
          { phone: '+995500000001', label: 'Wissol', source: 'tag' },
          { phone: '+995500000002', label: 'Wissol მენეჯერი', source: 'alias' },
        ]),
      },
    ]);
  });

  it('excludes members — every candidate query filters out registered UserPhone rows', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM search_activity'))
        return Promise.resolve(rows([{ query: 'Rompetrol', ask_count: '1', city: null }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await findUnmetNeeds(30);

    const candidateQueries = mockQuery.mock.calls.filter(
      ([sql]) =>
        (sql as string).includes('FROM "UserTags"') || (sql as string).includes('FROM "UserAlias"'),
    );
    expect(candidateQueries.length).toBeGreaterThan(0);
    for (const [sql] of candidateQueries) {
      expect(sql as string).toContain('NOT EXISTS (SELECT 1 FROM "UserPhone"');
    }
  });

  it('skips noise words shorter than the minimum length', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM search_activity'))
        return Promise.resolve(rows([{ query: 'a it', ask_count: '1', city: null }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await findUnmetNeeds(30);

    expect(out).toEqual([{ query: 'a it', ask_count: 1, city: null, candidates: [] }]);
    const candidateQueries = mockQuery.mock.calls.filter(
      ([sql]) =>
        (sql as string).includes('FROM "UserTags"') || (sql as string).includes('FROM "UserAlias"'),
    );
    expect(candidateQueries).toHaveLength(0);
  });

  it('passes the lookback window through as an interval, not string concatenation', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await findUnmetNeeds(90);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('make_interval(days =>');
    expect(params).toEqual([90]);
  });
});
