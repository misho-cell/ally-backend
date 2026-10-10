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
jest.mock('../../../services/setupState.service', () => ({
  ...jest.requireActual('../../../services/setupState.service'),
  recordStep: jest.fn(),
  setupState: jest.fn(),
}));
jest.mock('../../../services/setupTestPush.service', () => ({
  ...jest.requireActual('../../../services/setupTestPush.service'),
  sendTestPush: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import setupRouter from '../setup.routes';
import { recordStep, setupState } from '../../../services/setupState.service';
import { sendTestPush, TestPushOutcome } from '../../../services/setupTestPush.service';

const mockRecord = recordStep as jest.MockedFunction<typeof recordStep>;
const mockState = setupState as jest.MockedFunction<typeof setupState>;
const mockPush = sendTestPush as jest.MockedFunction<typeof sendTestPush>;

const STATE = {
  done_count: 1,
  total: 5,
  server: {
    install: false,
    notifications: false,
    contacts: true,
    freshness: false,
    connector: false,
  },
  devices: [],
};

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/setup', setupRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/setup`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

const put = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 1882 / the frontend's 06:30Z item 10. */
describe('the setup routes', () => {
  it('GET /setup/state answers the person’s list', async () => {
    mockState.mockResolvedValue(STATE as never);
    const res = await fetch(`${base}/state`);
    expect(res.status).toBe(200);
    expect(mockState).toHaveBeenCalledWith(171);
  });

  it('PUT saves a gadget’s step and answers the new list', async () => {
    mockState.mockResolvedValue(STATE as never);
    const res = await put('/devices/ph1/steps/install', { gadget: 'iphone', status: 'done' });
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith(171, 'ph1', 'iphone', 'install', 'done');
  });

  it.each([
    ['/devices/ph1/steps/fly', { gadget: 'iphone', status: 'done' }],
    ['/devices/ph1/steps/install', { gadget: 'nokia', status: 'done' }],
    ['/devices/ph1/steps/install', { gadget: 'iphone', status: 'maybe' }],
  ])('refuses %s %j with 400 and saves nothing', async (path, body) => {
    expect((await put(path, body)).status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('test push: 403 while off, 404 without a subscription, 200 when sent', async () => {
    mockPush.mockResolvedValueOnce(TestPushOutcome.Off);
    expect((await fetch(`${base}/test-push`, { method: 'POST' })).status).toBe(403);
    mockPush.mockResolvedValueOnce(TestPushOutcome.NoSubscription);
    expect((await fetch(`${base}/test-push`, { method: 'POST' })).status).toBe(404);
    mockPush.mockResolvedValueOnce(TestPushOutcome.Sent);
    expect((await fetch(`${base}/test-push`, { method: 'POST' })).status).toBe(200);
  });

  it('says 500 without the database error', async () => {
    mockState.mockRejectedValue(new Error('relation setup_steps does not exist'));
    const res = await fetch(`${base}/state`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});
