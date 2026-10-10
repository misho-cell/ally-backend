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
jest.mock('../../../services/connectorState.service', () => ({
  __esModule: true,
  connectorState: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import connectorRouter from '../connector.routes';
import { connectorState } from '../../../services/connectorState.service';

const mockState = connectorState as jest.MockedFunction<typeof connectorState>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use('/connector', connectorRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/connector/state`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** The frontend's 06:30Z item 8. */
describe('GET /connector/state', () => {
  it('answers the signed-in person’s own connector', async () => {
    mockState.mockResolvedValue({ connected: true, last_seen_at: '2026-10-10T08:00:00Z' });
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({
      connected: true,
      last_seen_at: '2026-10-10T08:00:00Z',
    });
    expect(mockState).toHaveBeenCalledWith(171);
  });

  it('says 500 without the database error', async () => {
    mockState.mockRejectedValue(new Error('relation oauth_tokens is locked'));
    const res = await fetch(base);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});
