const mockPoolQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockPoolQuery })),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { Request, Response } from 'express';
import { adminReadOnlyQuery } from '../roQuery.routes';

/**
 * 24 Oct: the founder rotated RO_SQL_KEY after the Railway incident, and a
 * running session keeps the key it started with. The same window now answers
 * a signed-in admin, with the same statement guard and the read-only role.
 */
interface Captured {
  status: number;
  body: unknown;
}

function call(sql: unknown): { req: Request; res: Response; out: Captured } {
  const out: Captured = { status: 0, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    },
  } as unknown as Response;
  return { req: { body: { sql } } as Request, res, out };
}

const ORIGINAL_URL = process.env.DATABASE_RO_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_RO_URL = 'postgres://ro@localhost/db';
});

afterAll(() => {
  process.env.DATABASE_RO_URL = ORIGINAL_URL;
});

describe('the read-only window for a signed-in admin', () => {
  it('answers one SELECT with the rows', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const { req, res, out } = call('SELECT 1 AS ok');
    await adminReadOnlyQuery(req, res);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({
      success: true,
      data: { rows: [{ ok: 1 }], row_count: 1, truncated: false },
    });
  });

  it('refuses anything but one read statement, before touching the database', async () => {
    const { req, res, out } = call('DELETE FROM threads');
    await adminReadOnlyQuery(req, res);
    expect(out.status).toBe(400);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('is closed when the read-only database is not configured', async () => {
    delete process.env.DATABASE_RO_URL;
    const { req, res, out } = call('SELECT 1');
    await adminReadOnlyQuery(req, res);
    expect(out.status).toBe(503);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('lives behind the admin router, which authenticates first', () => {
    const admin = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
    const authAt = admin.indexOf('adminRouter.use(authenticateJwt, requireAdminRole);');
    const routeAt = admin.indexOf("'/ro-sql'");
    expect(authAt).toBeGreaterThan(0);
    expect(routeAt).toBeGreaterThan(authAt);
  });
});
