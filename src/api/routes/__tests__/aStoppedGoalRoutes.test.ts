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
jest.mock('../../../services/goalStop.service', () => ({
  __esModule: true,
  stopGoalOnThread: jest.fn(),
  resumeStoppedGoal: jest.fn(),
  dismissStoppedGoal: jest.fn(),
}));
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import threadsRouter from '../threads.routes';
import { dismissStoppedGoal, resumeStoppedGoal } from '../../../services/goalStop.service';
import * as threads from '../../../services/threads.service';

const mockResume = resumeStoppedGoal as jest.MockedFunction<typeof resumeStoppedGoal>;
const mockDismiss = dismissStoppedGoal as jest.MockedFunction<typeof dismissStoppedGoal>;

let server: Server;
let base: string;

beforeAll((done) => {
  jest.spyOn(threads, 'threadLanguage').mockResolvedValue('ka');
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

/** #1919: resume or close a stopped goal. */
describe('POST /threads/:id/resume', () => {
  it('reopens the goal', async () => {
    mockResume.mockResolvedValueOnce({ ok: true, goal_id: 2872 });
    const res = await fetch(`${base}/14719/resume`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { goal_id: 2872 } });
    expect(mockResume).toHaveBeenCalledWith('501', 14719, 'ka');
  });

  it('is 409 for a goal that is not stopped, 404 for no goal', async () => {
    mockResume.mockResolvedValueOnce({ ok: false, reason: 'not_stopped' });
    expect((await fetch(`${base}/14719/resume`, { method: 'POST' })).status).toBe(409);
    mockResume.mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    expect((await fetch(`${base}/14719/resume`, { method: 'POST' })).status).toBe(404);
  });

  it('is 400 for an id that is not a number', async () => {
    expect((await fetch(`${base}/x/resume`, { method: 'POST' })).status).toBe(400);
  });
});

describe('POST /threads/:id/dismiss', () => {
  it('closes it for good', async () => {
    mockDismiss.mockResolvedValueOnce({ ok: true, goal_id: 2872 });
    const res = await fetch(`${base}/14719/dismiss`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(mockDismiss).toHaveBeenCalledWith('501', 14719);
  });

  it('never shows a raw error', async () => {
    mockDismiss.mockRejectedValueOnce(new Error('column "stop_dismissed_at" does not exist'));
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined);
    const res = await fetch(`${base}/14719/dismiss`, { method: 'POST' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('column');
  });
});
