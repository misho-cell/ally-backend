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
jest.mock('../../../services/factsAboutMe.service', () => ({
  ...jest.requireActual('../../../services/factsAboutMe.service'),
  factsAboutMe: jest.fn(),
  removeFactAboutMe: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import privacyRouter from '../privacy.routes';
import {
  FactOrigin,
  factsAboutMe,
  removeFactAboutMe,
  RemoveOutcome,
} from '../../../services/factsAboutMe.service';

const mockList = factsAboutMe as jest.MockedFunction<typeof factsAboutMe>;
const mockRemove = removeFactAboutMe as jest.MockedFunction<typeof removeFactAboutMe>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/privacy', privacyRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/privacy/facts-about-me`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** 4126 item 5 (Misho's yes, 9 Oct): a person sees and removes the facts about themselves. */
describe('/privacy/facts-about-me', () => {
  it('lists the facts about the signed-in person, without who saved them', async () => {
    const fact = {
      id: 9,
      field: 'employer',
      value: 'Acme',
      origin: FactOrigin.Research,
      source_url: 'https://a.example',
      date: '2026-10-04',
      status: 'possible',
    };
    mockList.mockResolvedValue([fact]);
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { facts: [fact] } });
    expect(mockList).toHaveBeenCalledWith(171);
  });

  it('removes one fact of the signed-in person', async () => {
    mockRemove.mockResolvedValue(RemoveOutcome.Removed);
    const res = await fetch(`${base}/9`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { removed: true } });
    expect(mockRemove).toHaveBeenCalledWith(171, 9);
  });

  it('answers 404 for a fact that is not about them, and 400 for a bad id', async () => {
    mockRemove.mockResolvedValue(RemoveOutcome.NotFound);
    expect((await fetch(`${base}/10`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/abc`, { method: 'DELETE' })).status).toBe(400);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('answers 500 without the database error when the read fails', async () => {
    mockList.mockRejectedValue(new Error('relation does not exist'));
    const res = await fetch(base);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});
