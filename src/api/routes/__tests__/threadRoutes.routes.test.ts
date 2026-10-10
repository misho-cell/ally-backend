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
jest.mock('../../middleware/subscription.middleware', () => ({
  __esModule: true,
  requireSubscriptionUnlessAnswering: (_req: unknown, _res: unknown, next: () => void): void =>
    next(),
}));
jest.mock('../../../services/routesBoard.service', () => ({
  ...jest.requireActual('../../../services/routesBoard.service'),
  routesForThread: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import threadsRouter from '../threads.routes';
import { routesForThread, RouteRole, RouteState } from '../../../services/routesBoard.service';

const mockRoutes = routesForThread as jest.MockedFunction<typeof routesForThread>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/threads', threadsRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/threads`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** D722, the frontend's 06:30Z item 2. */
describe('GET /threads/:id/routes', () => {
  it('answers the board for the signed-in owner', async () => {
    const route = {
      ask_id: 1,
      kind: 'ask' as const,
      person_name: 'ნინო',
      role: RouteRole.Addressee,
      state: RouteState.Waiting,
      summary: null,
      updated_at: '2026-10-10T06:00:00Z',
    };
    mockRoutes.mockResolvedValue([route, { ...route, ask_id: 2 }]);
    const res = await fetch(`${base}/48722/routes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { routes: unknown[] } };
    expect(body.data.routes).toHaveLength(2);
    expect(mockRoutes).toHaveBeenCalledWith(171, 48722);
  });

  it('says 400 for an id that is not one, and 500 without the database error', async () => {
    expect((await fetch(`${base}/abc/routes`)).status).toBe(400);
    mockRoutes.mockRejectedValue(new Error('relation tasks is locked'));
    const res = await fetch(`${base}/48722/routes`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});
