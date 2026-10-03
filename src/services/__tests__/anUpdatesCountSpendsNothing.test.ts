jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { countUpdatesForBadge } from '../pendingUpdates.service';

/**
 * #387, the frontend's ask: a badge count that does not release or mark
 * anything, because GET /updates does both in the same breath.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('countUpdatesForBadge', () => {
  it('counts what is due now and what waits for later', async () => {
    mockQuery.mockResolvedValue({ rows: [{ due: '2', held: '3' }], rowCount: 1 } as never);

    expect(await countUpdatesForBadge('165699')).toEqual({ due: 2, held: 3 });
  });

  it('only reads: no UPDATE, and the release query’s own conditions', async () => {
    mockQuery.mockResolvedValue({ rows: [{ due: '0', held: '0' }], rowCount: 1 } as never);

    await countUpdatesForBadge('165699');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql.trim().startsWith('SELECT')).toBe(true);
    expect(sql).not.toMatch(/\bUPDATE\b/);
    expect(sql).toContain("p.status = 'held'");
    expect(sql).toContain('t.pending_question_at IS NOT NULL');
    expect(params[0]).toBe('165699');
  });

  it('answers zero for an owner with nothing waiting', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect(await countUpdatesForBadge('165699')).toEqual({ due: 0, held: 0 });
  });
});

describe('the route', () => {
  it('is GET /updates/count, behind the router’s login', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
      'utf8',
    );
    expect(routes).toContain('updatesRouter.use(authenticateJwt, requireUserRole);');
    expect(routes).toContain("'/count',");
    expect(routes.indexOf("'/count',")).toBeGreaterThan(
      routes.indexOf('updatesRouter.use(authenticateJwt, requireUserRole);'),
    );
  });
});
