process.env.MCP_REF_SECRET = 'test-export-secret';
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  ...jest.requireActual('../../middleware/auth.middleware'),
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '167250' };
    next();
  },
  requireAdminRole: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import adminRouter from '../admin.routes';
import { query } from '../../../db/postgres/client';
import { exportPhoneHash } from '../../../services/axelExport/exportHash';

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});

async function post(body: unknown): Promise<Response> {
  return fetch(`${base}/exports/phone-hashes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The CELA list (Tornike, 19 Oct): outside numbers, hashed as the Axel export hashes them. */
describe('POST /admin/exports/phone-hashes', () => {
  it('answers the export’s own hash for each number, in order, whatever the format', async () => {
    const res = await post({ phones: ['+995 500 000 001', '995500000001', 'none'] });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { hashes: string[] } };
    expect(data.hashes).toEqual([
      exportPhoneHash('995500000001'),
      exportPhoneHash('995500000001'),
      '',
    ]);
    expect(data.hashes[0]).toMatch(/^[0-9a-f]{24}$/);
  });

  it('reads and writes nothing in the base', async () => {
    await post({ phones: ['995500000002'] });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a body that is not a short list of strings', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ phones: [] })).status).toBe(400);
    expect((await post({ phones: [123] })).status).toBe(400);
    expect((await post({ phones: Array.from({ length: 201 }, () => '1') })).status).toBe(400);
  });
});
