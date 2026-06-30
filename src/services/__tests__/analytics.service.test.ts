jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  __esModule: true,
}));

import { query } from '../../db/postgres/client';
import { getOverview } from '../analytics.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

// getOverview fans its queries out with Promise.all, so call order is not
// guaranteed. Route each call by a distinctive fragment of its SQL instead.
function routeQuery(sql: string): { rows: unknown[]; rowCount: number } {
  // Funnel steps are now separate scalar queries; match the specific ones
  // before the generic `COUNT(*) ... FROM "User"` so order stays deterministic.
  if (sql.includes('subscription_status')) return rows([{ count: '15' }]); // subscribed
  if (sql.includes('COUNT(DISTINCT "contactId")')) return rows([{ count: '80' }]); // imported
  if (sql.includes('COUNT(DISTINCT requester_user_id)')) return rows([{ count: '20' }]); // intro
  if (sql.includes('COUNT(DISTINCT user_id) AS count FROM search_activity'))
    return rows([{ count: '50' }]); // searched
  if (sql.includes('COUNT(*) AS count FROM "User"')) return rows([{ count: '120' }]); // total + signed_up
  if (sql.includes('GROUP BY DATE("createdAt")')) return rows([{ day: '2026-06-29', count: '5' }]);
  if (sql.includes('AS dau')) return rows([{ dau: '10', wau: '40', mau: '90' }]);
  if (sql.includes('FROM conversations') && sql.includes('AS count'))
    return rows([{ day: '2026-06-29', count: '7' }]);
  if (sql.includes('tool AS label'))
    return rows([
      { label: 'name', count: '30' },
      { label: 'tag', count: '12' },
    ]);
  if (sql.includes('status AS label'))
    return rows([
      { label: 'pending', count: '8' },
      { label: 'accepted', count: '12' },
    ]);
  if (sql.includes('AVG(cnt)')) return rows([{ avg: '42.6' }]);
  if (sql.includes('FROM contact_facts')) return rows([{ count: '200' }]);
  if (sql.includes('FROM contact_insights')) return rows([{ count: '150' }]);
  throw new Error(`Unexpected query: ${sql}`);
}

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation((sql: string) => Promise.resolve(routeQuery(sql) as never));
});

describe('getOverview', () => {
  it('aggregates growth metrics', async () => {
    const overview = await getOverview();

    expect(overview.growth.totalUsers).toBe(120);
    expect(overview.growth.newUsersByDay).toEqual([{ day: '2026-06-29', count: 5 }]);
  });

  it('aggregates retention metrics', async () => {
    const overview = await getOverview();

    expect(overview.retention).toMatchObject({ dau: 10, wau: 40, mau: 90 });
    expect(overview.retention.activeUsersByDay).toEqual([{ day: '2026-06-29', count: 7 }]);
  });

  it('builds the activation funnel in order', async () => {
    const overview = await getOverview();

    expect(overview.funnel.steps.map((s) => s.step)).toEqual([
      'signed_up',
      'imported_contacts',
      'searched',
      'requested_intro',
      'subscribed',
    ]);
    expect(overview.funnel.steps.map((s) => s.users)).toEqual([120, 80, 50, 20, 15]);
  });

  it('aggregates core usage with totals and rounded averages', async () => {
    const overview = await getOverview();

    expect(overview.usage.totalSearches).toBe(42);
    expect(overview.usage.searchesByType).toEqual([
      { label: 'name', count: 30 },
      { label: 'tag', count: 12 },
    ]);
    expect(overview.usage.avgNetworkSize).toBe(43);
    expect(overview.usage.factsCount).toBe(200);
    expect(overview.usage.insightsCount).toBe(150);
  });

  it('labels null search tools as unknown', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('tool AS label')) {
        return Promise.resolve({ rows: [{ label: null, count: '3' }], rowCount: 1 } as never);
      }
      return Promise.resolve(routeQuery(sql) as never);
    });

    const overview = await getOverview();

    expect(overview.usage.searchesByType).toEqual([{ label: 'unknown', count: 3 }]);
  });

  it('degrades a single failing block to empty and records a diagnostic', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(DISTINCT requester_user_id)')) {
        return Promise.reject(new Error('column "X" does not exist'));
      }
      return Promise.resolve(routeQuery(sql) as never);
    });

    const overview = await getOverview();

    // The broken block degrades, the others still resolve.
    expect(overview.funnel.steps).toEqual([]);
    expect(overview.growth.totalUsers).toBe(120);
    expect(overview.diagnostics).toEqual([
      { block: 'funnel', message: 'column "X" does not exist' },
    ]);
  });

  it('omits diagnostics entirely when every block succeeds', async () => {
    const overview = await getOverview();

    expect(overview.diagnostics).toBeUndefined();
  });
});
