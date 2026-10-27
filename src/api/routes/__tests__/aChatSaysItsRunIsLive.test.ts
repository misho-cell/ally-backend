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
jest.mock('../../../services/threads.service', () => ({
  ...jest.requireActual('../../../services/threads.service'),
  getThread: jest.fn(),
  getThreadMessages: jest.fn(),
  withRunSteps: jest.fn(),
  threadLanguage: jest.fn(),
}));
jest.mock('../../../services/caseDescriptionWriter.service', () => ({
  __esModule: true,
  describeIfMissing: jest.fn(),
}));
jest.mock('../../../services/netaiMessage.service', () => ({
  ...jest.requireActual('../../../services/netaiMessage.service'),
  markNetaiSeen: jest.fn().mockResolvedValue(undefined),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import threadsRouter from '../threads.routes';
import {
  getThread,
  getThreadMessages,
  threadLanguage,
  withRunSteps,
} from '../../../services/threads.service';
import { enterThread, leaveThread } from '../../../services/threadRunQueue';

/**
 * #8119 (the frontend, 27 Oct): coming back to a case chat while the assistant
 * is still working, the app showed it idle. The thread read now says whether a
 * run holds the chat and since when.
 */
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
beforeEach(() => {
  jest.clearAllMocks();
  (getThread as jest.Mock).mockResolvedValue({ id: 70060, type: 'regular', status: 'working' });
  (getThreadMessages as jest.Mock).mockResolvedValue([]);
  (withRunSteps as jest.Mock).mockResolvedValue([]);
  (threadLanguage as jest.Mock).mockResolvedValue('ka');
});

describe('GET /threads/:id/messages — the run (#8119)', () => {
  it('says a run is live, and since when, while one holds the chat', async () => {
    await enterThread(70060, 'run-live', 1000, 10);
    const res = await fetch(`${base}/70060/messages`);
    const body = (await res.json()) as { run_active: boolean; run_started_at: string | null };
    leaveThread(70060, 'run-live');

    expect(res.status).toBe(200);
    expect(body.run_active).toBe(true);
    expect(Number.isNaN(Date.parse(body.run_started_at ?? ''))).toBe(false);
  });

  it('says no run when none holds it', async () => {
    const res = await fetch(`${base}/70060/messages`);
    const body = (await res.json()) as { run_active: boolean; run_started_at: string | null };

    expect(body.run_active).toBe(false);
    expect(body.run_started_at).toBeNull();
  });

  it('answers 404 for a chat that is not the reader’s', async () => {
    (getThread as jest.Mock).mockResolvedValue(null);
    expect((await fetch(`${base}/70060/messages`)).status).toBe(404);
  });
});
