jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { PAST_SUMMARIES_LIMIT, pastWeeklySummaries } from '../pendingUpdates.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** 4296 (plate NEW-5): last week's summary could not be opened again. */
describe('a past weekly summary', () => {
  it('is read back for its own person, newest first, read or not, without spending anything', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 9, task_id: null, kind: 'weekly_summary', payload: {} }],
    } as never);
    await expect(pastWeeklySummaries('171')).resolves.toHaveLength(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql.trim().startsWith('SELECT')).toBe(true);
    expect(sql).not.toMatch(/\bUPDATE\b/);
    expect(sql).not.toContain("status = 'seen'");
    expect(sql).toContain('ORDER BY p.release_at DESC');
    expect(params).toEqual(['171', 'weekly_summary', PAST_SUMMARIES_LIMIT]);
  });

  it('is served at GET /updates/weekly-summaries, behind the router’s login', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("'/weekly-summaries',");
    expect(routes.indexOf("'/weekly-summaries',")).toBeGreaterThan(
      routes.indexOf('updatesRouter.use(authenticateJwt, requireUserRole);'),
    );
  });
});
