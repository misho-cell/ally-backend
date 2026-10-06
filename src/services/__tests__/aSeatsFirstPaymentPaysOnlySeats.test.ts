jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../costLedger.service', () => ({ __esModule: true, getPrice: jest.fn() }));
jest.mock('../referral.service', () => ({
  __esModule: true,
  ...jest.requireActual('../referral.service'),
  distributeReferralEarnings: jest.fn(),
  clawbackReferralEarnings: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { getPrice } from '../costLedger.service';
import { clawbackReferralEarnings, distributeReferralEarnings } from '../referral.service';
import {
  SeatPaymentRefusal,
  SeatPlan,
  seatPeriod,
  simulateSeatFirstPayment,
  undoSeatFirstPayment,
} from '../seatFirstPayment.service';

/**
 * §94 (Misho, 6 Oct): #1916's reward rule on fictions — a test seat's first
 * payment, no card, no Stripe; never a real person credited.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPrice = getPrice as jest.MockedFunction<typeof getPrice>;
const mockDistribute = distributeReferralEarnings as jest.MockedFunction<
  typeof distributeReferralEarnings
>;
const mockClawback = clawbackReferralEarnings as jest.MockedFunction<
  typeof clawbackReferralEarnings
>;
const NOW = new Date('2026-10-06T21:30:00.000Z');

function result(rowCount: number, rows: unknown[] = []): Awaited<ReturnType<typeof query>> {
  return { rowCount, rows } as unknown as Awaited<ReturnType<typeof query>>;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrice.mockResolvedValue(6);
});

describe('a test seat’s first payment', () => {
  it('pays the chain through the same reward step a Stripe charge takes', async () => {
    mockQuery.mockResolvedValueOnce(result(1)).mockResolvedValueOnce(result(1, [{ outsiders: 0 }]));
    mockDistribute.mockResolvedValueOnce(3);

    const outcome = await simulateSeatFirstPayment(177942, 19.99, SeatPlan.Month, NOW);

    expect(outcome).toEqual({
      ok: true,
      external_id: `seat_test_177942_${NOW.getTime()}`,
      base_usd: 19.99,
      shares: 3,
    });
    expect(mockDistribute).toHaveBeenCalledWith('177942', 19.99, outcome.ok && outcome.external_id);
    expect(mockQuery.mock.calls[1][1]).toEqual([177942, 6]);
  });

  it('counts an annual plan as one month of it (D693)', async () => {
    mockQuery.mockResolvedValueOnce(result(1)).mockResolvedValueOnce(result(1, [{ outsiders: 0 }]));
    mockDistribute.mockResolvedValueOnce(1);

    const outcome = await simulateSeatFirstPayment(177942, 120, SeatPlan.Year, NOW);

    expect(outcome.ok && outcome.base_usd).toBe(10);
  });

  it('is refused for an account that is not a test seat, before anything is written', async () => {
    mockQuery.mockResolvedValueOnce(result(0));
    await expect(simulateSeatFirstPayment(501, 19.99, SeatPlan.Month, NOW)).resolves.toEqual({
      ok: false,
      refusal: SeatPaymentRefusal.NotATestSeat,
    });
    expect(mockDistribute).not.toHaveBeenCalled();
  });

  it('is refused when the chain reaches a real person', async () => {
    mockQuery.mockResolvedValueOnce(result(1)).mockResolvedValueOnce(result(1, [{ outsiders: 1 }]));
    await expect(simulateSeatFirstPayment(177942, 19.99, SeatPlan.Month, NOW)).resolves.toEqual({
      ok: false,
      refusal: SeatPaymentRefusal.ChainLeavesTestSeats,
    });
    expect(mockDistribute).not.toHaveBeenCalled();
  });

  it('reads a year as a year and a month as a month', () => {
    expect(seatPeriod(SeatPlan.Year, NOW).end.toISOString()).toBe('2027-10-06T21:30:00.000Z');
    expect(seatPeriod(SeatPlan.Month, NOW).end.toISOString()).toBe('2026-11-06T21:30:00.000Z');
  });
});

describe('its undo', () => {
  it('takes the shares back through the refund path', async () => {
    mockQuery.mockResolvedValueOnce(result(1));
    mockClawback.mockResolvedValueOnce(3);
    await expect(undoSeatFirstPayment(177942, 'seat_test_177942_1')).resolves.toEqual({
      ok: true,
      taken_back: 3,
    });
    expect(mockClawback).toHaveBeenCalledWith('seat_test_177942_1');
  });

  it('touches only this seat’s own simulated payment', async () => {
    await expect(undoSeatFirstPayment(177942, 'in_1Pabc')).resolves.toEqual({
      ok: false,
      refusal: SeatPaymentRefusal.NotASeatPayment,
    });
    await expect(undoSeatFirstPayment(177942, 'seat_test_177943_1')).resolves.toEqual({
      ok: false,
      refusal: SeatPaymentRefusal.NotASeatPayment,
    });
    expect(mockClawback).not.toHaveBeenCalled();
  });
});

describe('the admin routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('path') as typeof import('path');
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('sit behind the admin role, with the amount bounded and a note required', () => {
    expect(routes).toContain('adminRouter.use(authenticateJwt, requireAdminRole);');
    expect(routes).toContain("'/test-accounts/:id/first-payment'");
    expect(routes).toContain("'/test-accounts/:id/first-payment/undo'");
    expect(routes).toContain("body('amount_usd').isFloat({ gt: 0, max: MAX_SEAT_PAYMENT_USD })");
    expect(routes).toContain("body('note').isString().trim().isLength({ min: 3, max: 500 })");
  });

  it('answer a refusal with 403 and its name', () => {
    expect(routes).toContain('res.status(403).json({ success: false, error: outcome.refusal });');
  });
});
