jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
}));
jest.mock('../../../services/costLedger.service', () => ({
  __esModule: true,
  getPrice: jest.fn(),
}));
jest.mock('../../../services/inviteReward.service', () => ({
  __esModule: true,
  inviteFreeDays: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import billingOfferRouter from '../billingOffer.routes';
import { inviteFreeDays } from '../../../services/inviteReward.service';
import { getPrice } from '../../../services/costLedger.service';
import { DEFAULT_TRIAL_DAYS } from '../../../services/inviteCohorts.service';

const mockInviteDays = inviteFreeDays as jest.MockedFunction<typeof inviteFreeDays>;
const mockPrice = getPrice as jest.MockedFunction<typeof getPrice>;
const PRICES: Readonly<Record<string, number>> = {
  'subscription.price.pro': 19.99,
  'subscription.price.enterprise': 79,
};

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use('/billing/offer', billingOfferRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/billing/offer`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => {
  jest.clearAllMocks();
  mockPrice.mockImplementation((key: string) => Promise.resolve(PRICES[key] ?? 0));
});

/** Misho, 9 Oct: the pricing page shows the card trial and the invitation's free days. */
describe('GET /billing/offer', () => {
  it('answers without a token, with both numbers', async () => {
    mockInviteDays.mockResolvedValueOnce(20);
    const res = await fetch(base);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        card_trial_days: DEFAULT_TRIAL_DAYS,
        invite_free_days: 20,
        plans: { pro: 19.99, enterprise: 79 },
      },
    });
  });

  it('says null for the invitation while its switch is off', async () => {
    mockInviteDays.mockResolvedValueOnce(null);
    const res = await fetch(base);
    await expect(res.json()).resolves.toMatchObject({ data: { invite_free_days: null } });
  });

  /** Misho, 10 Oct (frontend 05:10Z): the plan prices from the rows the charge reads. */
  it('says null for a plan with no price row, so the page keeps its own', async () => {
    mockInviteDays.mockResolvedValueOnce(null);
    mockPrice.mockImplementation((key: string) =>
      Promise.resolve(key === 'subscription.price.pro' ? 19.99 : 0),
    );
    const res = await fetch(base);
    await expect(res.json()).resolves.toMatchObject({
      data: { plans: { pro: 19.99, enterprise: null } },
    });
  });

  it('says 500 with a plain message when the read fails', async () => {
    mockInviteDays.mockRejectedValueOnce(new Error('relation app_flags is locked'));
    const res = await fetch(base);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Could not read the offer',
    });
  });
});
