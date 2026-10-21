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
jest.mock('../../../services/trialGrant.service', () => ({
  __esModule: true,
  ...jest.requireActual('../../../services/trialGrant.service'),
  readTrialGrant: jest.fn(),
  writeTrialGrant: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import adminRouter from '../admin.routes';
import {
  MAX_TRIAL_GRANT,
  readTrialGrant,
  writeTrialGrant,
} from '../../../services/trialGrant.service';

const mockRead = readTrialGrant as jest.MockedFunction<typeof readTrialGrant>;
const mockWrite = writeTrialGrant as jest.MockedFunction<typeof writeTrialGrant>;
const STAMP = '2026-10-21T12:00:00.000Z';

let server: Server;
let url: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  server = app.listen(0, () => {
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/token-grants/trial`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

async function put(body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Misho, 21 Oct: the trial's tokens are changed from the dashboard, not by a deploy. */
describe('GET /admin/token-grants/trial', () => {
  it('answers the number the wallet will credit', async () => {
    mockRead.mockResolvedValueOnce({ value: 2000, updated_at: STAMP });

    const res = await fetch(url);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { value: 2000, updated_at: STAMP },
    });
  });

  it('answers 500 without the database error', async () => {
    mockRead.mockRejectedValueOnce(new Error('relation "provider_prices" is broken'));

    const res = await fetch(url);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('provider_prices');
  });
});

describe('PUT /admin/token-grants/trial', () => {
  it('writes a whole number within the bound', async () => {
    mockWrite.mockResolvedValueOnce({ value: 2500, updated_at: STAMP });

    const res = await put({ value: 2500 });
    expect(res.status).toBe(200);
    expect(mockWrite).toHaveBeenCalledWith(2500);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { value: 2500, updated_at: STAMP },
    });
  });

  it('accepts zero — no trial tokens at all', async () => {
    mockWrite.mockResolvedValueOnce({ value: 0, updated_at: STAMP });

    expect((await put({ value: 0 })).status).toBe(200);
    expect(mockWrite).toHaveBeenCalledWith(0);
  });

  it('refuses anything that is not a whole number in the bound, and writes nothing', async () => {
    for (const value of [-1, MAX_TRIAL_GRANT + 1, 2.5, 'lots', null]) {
      expect((await put({ value })).status).toBe(400);
    }
    expect((await put({})).status).toBe(400);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('answers 500 without the database error', async () => {
    mockWrite.mockRejectedValueOnce(new Error('deadlock detected'));

    const res = await put({ value: 2000 });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('deadlock');
  });
});
