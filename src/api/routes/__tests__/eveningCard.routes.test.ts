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
jest.mock('../../../services/eveningCard.service', () => ({
  __esModule: true,
  currentEveningCard: jest.fn(),
  snoozeEveningCard: jest.fn(),
  eveningCardHour: jest.fn(),
  setEveningCardHour: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import eveningCardRouter from '../eveningCard.routes';
import {
  currentEveningCard,
  eveningCardHour,
  setEveningCardHour,
  snoozeEveningCard,
} from '../../../services/eveningCard.service';

const mockCurrent = currentEveningCard as jest.MockedFunction<typeof currentEveningCard>;
const mockSnooze = snoozeEveningCard as jest.MockedFunction<typeof snoozeEveningCard>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/evening-card', eveningCardRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/evening-card`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** #1850: the evening card's two routes. */
describe('GET /evening-card', () => {
  it('returns the person’s card', async () => {
    const card = {
      id: 7,
      due_at: '2026-10-06T15:00:00.000Z',
      snoozes: 0,
      choices: ['a', 'b', 'c'],
      items: [],
    };
    mockCurrent.mockResolvedValueOnce(card);

    const res = await fetch(base);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { card } });
    expect(mockCurrent).toHaveBeenCalledWith(171);
  });

  it('returns null when nothing waits', async () => {
    mockCurrent.mockResolvedValueOnce(null);
    expect(await (await fetch(base)).json()).toEqual({ success: true, data: { card: null } });
  });

  it('never shows a raw database error', async () => {
    mockCurrent.mockRejectedValueOnce(new Error('relation "evening_cards" does not exist'));
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined);

    const res = await fetch(base);

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});

describe('POST /evening-card/:id/snooze', () => {
  it('moves the whole card two hours on', async () => {
    mockSnooze.mockResolvedValueOnce(new Date('2026-10-06T17:00:00Z'));

    const res = await fetch(`${base}/7/snooze`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { due_at: '2026-10-06T17:00:00.000Z' },
    });
    expect(mockSnooze).toHaveBeenCalledWith(171, 7);
  });

  it('is 404 for a card that is not theirs', async () => {
    mockSnooze.mockResolvedValueOnce(null);
    expect((await fetch(`${base}/8/snooze`, { method: 'POST' })).status).toBe(404);
  });

  it('is 400 for an id that is not a number', async () => {
    expect((await fetch(`${base}/x/snooze`, { method: 'POST' })).status).toBe(400);
    expect(mockSnooze).not.toHaveBeenCalled();
  });
});

/** The frontend's 06:30Z item 6: the evening hour as a setting. */
describe('/evening-card/hour', () => {
  const mockHour = eveningCardHour as jest.MockedFunction<typeof eveningCardHour>;
  const mockSet = setEveningCardHour as jest.MockedFunction<typeof setEveningCardHour>;
  const put = (body: unknown): Promise<Response> =>
    fetch(`${base}/hour`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('reads the hour', async () => {
    mockHour.mockResolvedValue(19);
    const res = await fetch(`${base}/hour`);
    expect(await res.json()).toEqual({ success: true, data: { hour: 19 } });
  });

  it('sets an hour in the waking day, and null back to the default', async () => {
    mockHour.mockResolvedValue(21);
    expect((await put({ hour: 21 })).status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(171, 21);
    expect((await put({ hour: null })).status).toBe(200);
    expect(mockSet).toHaveBeenLastCalledWith(171, null);
  });

  it('refuses an hour outside 8 to 22, a fraction and a word', async () => {
    for (const hour of [3, 23, 19.5, 'evening']) {
      expect((await put({ hour })).status).toBe(400);
    }
    expect(mockSet).not.toHaveBeenCalled();
  });
});
