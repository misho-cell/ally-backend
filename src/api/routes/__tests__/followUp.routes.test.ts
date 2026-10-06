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
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../../services/followUp.service', () => ({
  __esModule: true,
  setUpdateFollowed: jest.fn(),
  listFollowedUpdates: jest.fn(),
  countFollowedUpdates: jest.fn(),
  setThreadFollowed: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import updatesRouter from '../updates.routes';
import { setUpdateFollowed } from '../../../services/followUp.service';

/** #2080 (D703): flag an update card to come back to, or clear it. */
const mockFollow = setUpdateFollowed as jest.MockedFunction<typeof setUpdateFollowed>;

let server: Server;
let base: string;

beforeAll((done) => {
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

describe('PUT / DELETE /updates/:ref/follow', () => {
  it('flags the caller’s card', async () => {
    mockFollow.mockResolvedValueOnce(true);
    const res = await fetch(`${base}/upd_9/follow`, { method: 'PUT' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { update_ref: 'upd_9', followed: true },
    });
    expect(mockFollow).toHaveBeenCalledWith('171', 9, true);
  });

  it('clears it with the second tap', async () => {
    mockFollow.mockResolvedValueOnce(true);
    const res = await fetch(`${base}/upd_9/follow`, { method: 'DELETE' });
    expect((await res.json()).data).toEqual({ update_ref: 'upd_9', followed: false });
    expect(mockFollow).toHaveBeenCalledWith('171', 9, false);
  });

  it('refuses a ref that is not an update’s', async () => {
    const res = await fetch(`${base}/req_9/follow`, { method: 'PUT' });
    expect(res.status).toBe(400);
    expect(mockFollow).not.toHaveBeenCalled();
  });

  it('is 404 for a card that is not the caller’s', async () => {
    mockFollow.mockResolvedValueOnce(false);
    const res = await fetch(`${base}/upd_9/follow`, { method: 'PUT' });
    expect(res.status).toBe(404);
  });

  it('is 500 with a plain line when the write fails', async () => {
    mockFollow.mockRejectedValueOnce(new Error('db down'));
    const res = await fetch(`${base}/upd_9/follow`, { method: 'PUT' });
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});
