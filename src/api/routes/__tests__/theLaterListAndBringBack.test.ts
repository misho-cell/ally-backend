jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../../db/postgres/client';
import {
  bringUpdateBackNow,
  HELD_LIST_MAX,
  listHeldUpdates,
} from '../../../services/pendingUpdates.service';

/**
 * The frontend's 13 Oct ask (FIXED2 „later" list): GET /updates/held lists what
 * was put off and when it returns, spending nothing; DELETE /updates/:ref/snooze
 * brings one back now.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const ROUTES = readFileSync(join(__dirname, '..', 'updates.routes.ts'), 'utf8');

beforeEach(() => mockQuery.mockReset());

describe('the held list', () => {
  it('reads the caller’s rows still ahead, soonest first, capped', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 5,
          task_id: null,
          kind: 'weekly_summary',
          payload: {},
          release_at: '2026-10-15T09:00:00Z',
        },
      ],
      rowCount: 1,
    } as never);
    const rows = await listHeldUpdates('7');
    expect(rows).toHaveLength(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("p.user_id = $1 AND p.status = 'held'");
    expect(sql).toContain('AND p.release_at > NOW()');
    expect(sql).toContain('ORDER BY p.release_at ASC, p.id ASC');
    expect(sql).not.toMatch(/UPDATE|status = 'seen'/u);
    expect(params[0]).toBe('7');
    expect(params[2]).toBe(HELD_LIST_MAX);
  });
});

describe('bring back now', () => {
  it('makes the caller’s held row due at once', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    expect(await bringUpdateBackNow('7', 5)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET release_at = NOW()');
    expect(sql).toContain(
      "WHERE id = $1 AND user_id = $2 AND status = 'held' AND release_at > NOW()",
    );
    expect(params).toEqual([5, '7']);
  });

  it('is false for a row that is not the caller’s or not held for later', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    expect(await bringUpdateBackNow('7', 6)).toBe(false);
  });
});

describe('the routes', () => {
  it('GET /held answers { held: [{ update_ref, title, detail, until }] } and never spends', () => {
    const route = ROUTES.slice(ROUTES.indexOf("'/held',"), ROUTES.indexOf("'/weekly-summaries'"));
    expect(route).toContain('listHeldUpdates(userId)');
    expect(route).toContain('update_ref: toUpdateRef(u.id)');
    expect(route).toContain('until: new Date(u.release_at).toISOString()');
    expect(route).toContain('data: { held }');
    expect(route).not.toContain('getPendingUpdates');
  });

  it('DELETE /:ref/snooze refuses a bad ref with 400 and a ref not held for you with 404', () => {
    const route = ROUTES.slice(ROUTES.indexOf("updatesRouter.delete(\n  '/:ref/snooze'"));
    expect(route).toContain('if (id === null) {');
    expect(route).toContain('res.status(400)');
    expect(route).toContain('if (!(await bringUpdateBackNow(userId, id))) {');
    expect(route).toContain('res.status(404)');
  });
});
