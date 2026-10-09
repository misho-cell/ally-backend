jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
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
import { DEFAULT_TRIAL_DAYS } from '../../../services/inviteCohorts.service';

const mockInviteDays = inviteFreeDays as jest.MockedFunction<typeof inviteFreeDays>;

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
beforeEach(() => jest.clearAllMocks());

/** Misho, 9 Oct: the pricing page shows the card trial and the invitation's free days. */
describe('GET /billing/offer', () => {
  it('answers without a token, with both numbers', async () => {
    mockInviteDays.mockResolvedValueOnce(20);
    const res = await fetch(base);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { card_trial_days: DEFAULT_TRIAL_DAYS, invite_free_days: 20 },
    });
  });

  it('says null for the invitation while its switch is off', async () => {
    mockInviteDays.mockResolvedValueOnce(null);
    const res = await fetch(base);
    await expect(res.json()).resolves.toMatchObject({ data: { invite_free_days: null } });
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
