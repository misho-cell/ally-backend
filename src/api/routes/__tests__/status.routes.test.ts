jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '171' };
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
jest.mock('../../../services/assistantStatus.service', () => ({
  __esModule: true,
  assistantStatus: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import statusRouter from '../status.routes';
import { assistantStatus } from '../../../services/assistantStatus.service';

const mockStatus = assistantStatus as jest.MockedFunction<typeof assistantStatus>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use('/status', statusRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/status`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** D699: GET /status/assistant. */
describe('GET /status/assistant', () => {
  it('returns the state', async () => {
    const status = {
      state: 'not_answering',
      since: '2026-10-09T19:00:00.000Z',
      checked_at: '2026-10-09T19:00:00.000Z',
    } as const;
    mockStatus.mockResolvedValueOnce(status as never);
    const res = await fetch(`${base}/assistant`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: status });
  });

  it('says 500 with a plain message when the read fails', async () => {
    mockStatus.mockRejectedValueOnce(new Error('connection refused at 10.0.0.1'));
    const res = await fetch(`${base}/assistant`);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Could not read the assistant status',
    });
  });
});
