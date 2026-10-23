jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '501' };
    next();
  },
  requireUserRole: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
}));
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import updatesRouter from '../updates.routes';
import { query } from '../../../db/postgres/client';
import * as threads from '../../../services/threads.service';
import { LATEST_UPDATES_LIMIT } from '../../../services/pendingUpdates.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
const GOAL_ID = 25973;
const THREAD_ID = 52283;
const RELEASED = new Date('2026-10-15T08:00:00.000Z');

let server: Server;
let base: string;

beforeAll((done) => {
  jest.spyOn(threads, 'userLanguage').mockResolvedValue('ka');
  const app = express();
  app.use(express.json());
  app.use('/updates', updatesRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/updates`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

function answerQueries(latestRows: unknown[]): void {
  mockQuery.mockImplementation((sql: unknown) =>
    Promise.resolve({
      rows: String(sql).includes('FROM pending_updates p')
        ? latestRows
        : String(sql).includes('FROM tasks')
          ? [{ id: GOAL_ID, title: 'მიწის ნაკვეთის გაყიდვა' }]
          : [],
      rowCount: 0,
    } as never),
  );
}

/** #5121 (Giorgi, 15 Oct): the home card „ბოლო სიახლეები" shows the newest updates. */
describe('GET /updates/latest', () => {
  it('answers each update with its case thread, a line, and when it came out', async () => {
    answerQueries([
      {
        id: 7,
        task_id: GOAL_ID,
        kind: 'search_result',
        payload: {},
        thread_id: THREAD_ID,
        case_title: 'მიწის გაყიდვა',
        released_at: RELEASED,
      },
    ]);
    const res = await fetch(`${base}/latest`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { updates: Array<Record<string, unknown>> };
    };
    expect(body.success).toBe(true);
    expect(body.data.updates).toHaveLength(1);
    const [row] = body.data.updates;
    expect(row.thread_id).toBe(THREAD_ID);
    expect(row.case_title).toBe('მიწის გაყიდვა');
    expect(row.task_id).toBe(GOAL_ID);
    expect(row.released_at).toBe(RELEASED.toISOString());
    expect(typeof row.line).toBe('string');
    expect(String(row.line).length).toBeGreaterThan(0);
    expect(typeof row.update_ref).toBe('string');
  });

  it('answers an empty list when nothing came out yet', async () => {
    answerQueries([]);
    const res = await fetch(`${base}/latest`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { updates: [] } });
  });

  it('only reads: no UPDATE, newest first, at most three, never the weekly summary', async () => {
    answerQueries([]);
    await fetch(`${base}/latest`);
    const call = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM pending_updates p'),
    );
    expect(call).toBeDefined();
    const [sql, params] = call as unknown as [string, unknown[]];
    expect(sql.trim().startsWith('SELECT')).toBe(true);
    expect(sql).not.toMatch(/\bUPDATE\b/);
    expect(sql).toContain('ORDER BY p.release_at DESC');
    expect(sql).toContain('p.release_at <= NOW()');
    expect(sql).toContain('th.short_title AS case_title');
    expect(params).toEqual([OWNER, ['weekly_summary'], LATEST_UPDATES_LIMIT]);
    expect(LATEST_UPDATES_LIMIT).toBe(3);
  });

  it('is 500 with a plain message when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));
    const res = await fetch(`${base}/latest`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).not.toContain('connection');
  });
});
