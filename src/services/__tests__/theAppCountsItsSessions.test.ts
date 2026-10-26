const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockVerify = jest.fn();
jest.mock('../auth.service', () => ({
  verifyToken: (...a: unknown[]) => mockVerify(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { Request, Response } from 'express';
import { appSessionStats, noteAppActivity, SESSION_IDLE_MINUTES } from '../appSessions.service';
import { trackAppSession } from '../../api/middleware/appSession.middleware';

beforeEach(() => {
  jest.resetAllMocks();
  mockQuery.mockResolvedValue({ rows: [] });
});

function request(path: string, userId: string, deviceId?: string): Request {
  mockVerify.mockReturnValue({ userId, role: 'user' });
  return {
    path,
    headers: {
      authorization: 'Bearer t',
      ...(deviceId === undefined ? {} : { 'x-device-id': deviceId }),
    },
  } as unknown as Request;
}

/** #7888: sessions per person (2 x 15 min a week is the founder's target). */
describe('the app counts its sessions', () => {
  it('extends the open session or starts one after 30 idle minutes', async () => {
    await noteAppActivity('7');
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain('UPDATE app_sessions SET last_seen_at = NOW()');
    expect(sql).toContain('WHERE NOT EXISTS (SELECT 1 FROM open_session)');
    expect(params).toEqual(['7', SESSION_IDLE_MINUTES]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('reads sessions and minutes for many people, zeros for none', async () => {
    expect(await appSessionStats([])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
    await appSessionStats([7, 8]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM unnest($1::int[]) AS u(id)');
    expect(sql).toContain('LEFT JOIN app_sessions s');
    expect(params).toEqual([[7, 8]]);
  });

  it('counts the app, not the connector or the push receipt, and once a minute', () => {
    const next = jest.fn();
    trackAppSession(request('/threads', '41', 'dev-1'), {} as Response, next);
    trackAppSession(request('/threads', '41', 'dev-1'), {} as Response, next);
    trackAppSession(request('/mcp', '42'), {} as Response, next);
    trackAppSession(request('/notifications/receipt', '43', 'dev-3'), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(4);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect((mockQuery.mock.calls[0] as unknown[])[1]).toEqual(['41', SESSION_IDLE_MINUTES]);
  });

  it('is shown in the admin user read and in a list for many people', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain('app_sessions: sessions ?? null');
    expect(routes).toContain("adminRouter.get('/app-sessions'");
    const index = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');
    expect(index).toContain('app.use(trackAppSession);');
  });
});
