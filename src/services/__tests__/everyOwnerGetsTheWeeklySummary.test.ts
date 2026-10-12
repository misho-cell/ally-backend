jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { sendWeeklySummaries } from '../weeklySummary.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const DUE_QUERY_MARK = 'ORDER BY t.user_id LIMIT $1';

function isDueQuery(sql: unknown): boolean {
  return String(sql).includes(DUE_QUERY_MARK);
}

function dueCalls(): unknown[][] {
  return mockQuery.mock.calls.filter(([sql]) => isDueQuery(sql)).map(([, params]) => params ?? []);
}

/** RW-023 (box 54088): 758 owners had an open goal and the same 200 got the summary every week. */
describe('the weekly summary reaches every owner with an open goal', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks only for owners not summarised this week, so the limit never hides anyone', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    expect(await sendWeeklySummaries()).toBe(0);
    const [sql] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('NOT EXISTS');
    expect(String(sql)).toContain('p.kind = $2');
    expect(dueCalls()[0]).toEqual([200, 'weekly_summary', []]);
  });

  it('takes the next batch after the first, and never retries a failed owner in the same run', async () => {
    let dueRound = 0;
    mockQuery.mockImplementation((async (sql: string) => {
      if (isDueQuery(sql)) {
        dueRound++;
        return { rows: dueRound === 1 ? [{ user_id: '501' }] : [] };
      }
      throw new Error('composition read failed');
    }) as never);

    expect(await sendWeeklySummaries()).toBe(0);
    const rounds = dueCalls();
    expect(rounds).toHaveLength(2);
    expect(rounds[1][2]).toEqual(['501']);
  });
});
