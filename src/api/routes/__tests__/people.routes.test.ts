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
  requireSubscription: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../../services/memberCard.service', () => ({
  __esModule: true,
  memberCardFor: jest.fn(),
}));
jest.mock('../../../services/chainMap.service', () => ({
  __esModule: true,
  chainMapsFor: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { membersRouter, pathsRouter } from '../people.routes';
import { memberCardFor } from '../../../services/memberCard.service';
import { chainMapsFor } from '../../../services/chainMap.service';

const mockCard = memberCardFor as jest.MockedFunction<typeof memberCardFor>;
const mockMaps = chainMapsFor as jest.MockedFunction<typeof chainMapsFor>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use('/members', membersRouter);
  app.use('/paths', pathsRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** The frontend's item 9 (§127). */
describe('GET /members/:id', () => {
  it('answers the card, keyed by the sealed id', async () => {
    const card = {
      id: 'c_x',
      name: 'ნინო ბერიძე',
      role: 'ბუღალტერი',
      company: 'TBC',
      city: 'თბილისი',
      areas: ['ფინანსები'],
      open_to: ['ბუღალტრული კონსულტაცია'],
    };
    mockCard.mockResolvedValue(card);
    const res = await fetch(`${base}/members/c_x`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual(card);
    expect(mockCard).toHaveBeenCalledWith(171, 'c_x');
  });

  it('says 404 for an id that is not a member of this owner’s, and 500 without the error', async () => {
    mockCard.mockResolvedValueOnce(null);
    expect((await fetch(`${base}/members/c_other`)).status).toBe(404);
    mockCard.mockRejectedValueOnce(new Error('relation "User" is locked'));
    const res = await fetch(`${base}/members/c_x`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('locked');
  });
});

describe('GET /paths/:id', () => {
  it('answers the maps, an empty list when no member can carry it, 404 for a foreign id', async () => {
    mockMaps.mockResolvedValueOnce([]);
    const res = await fetch(`${base}/paths/c_x`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({ paths: [] });
    mockMaps.mockResolvedValueOnce(null);
    expect((await fetch(`${base}/paths/c_other`)).status).toBe(404);
  });
});
