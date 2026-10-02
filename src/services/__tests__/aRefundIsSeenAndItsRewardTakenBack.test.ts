const invoicePaymentsList = jest.fn();
const sessionsList = jest.fn();
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../stripe.service', () => ({
  __esModule: true,
  stripeClient: () => ({
    invoicePayments: { list: invoicePaymentsList },
    checkout: { sessions: { list: sessionsList } },
  }),
}));
jest.mock('../referral.service', () => ({
  __esModule: true,
  clawbackReferralEarnings: jest.fn().mockResolvedValue(2),
}));

import Stripe from 'stripe';
import { query } from '../../db/postgres/client';
import { clawbackReferralEarnings } from '../referral.service';
import { applyChargeRefund } from '../stripeRefund.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockClawback = clawbackReferralEarnings as jest.MockedFunction<
  typeof clawbackReferralEarnings
>;

function charge(over: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 1999, ...over } as Stripe.Charge;
}

beforeEach(() => {
  jest.clearAllMocks();
  invoicePaymentsList.mockResolvedValue({ data: [{ invoice: 'in_1' }] });
  sessionsList.mockResolvedValue({ data: [] });
});

/** Board #232 + #233 (Misho: „კი ჩამოეჭრას"). */
describe('a refund issued in the Stripe dashboard', () => {
  it('marks the payment refunded by the id we stored, and takes its rewards back', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ external_id: 'in_1' }] } as never);

    expect(await applyChargeRefund(charge())).toEqual({ payments: ['in_1'], clawedBack: 2 });
    expect(mockQuery.mock.calls[0][1]).toEqual([['in_1'], '19.99']);
    expect(mockClawback).toHaveBeenCalledWith('in_1');
  });

  it('finds a token pack by its Checkout session', async () => {
    invoicePaymentsList.mockResolvedValueOnce({ data: [] });
    sessionsList.mockResolvedValueOnce({ data: [{ id: 'cs_9' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ external_id: 'cs_9' }] } as never);

    expect((await applyChargeRefund(charge())).payments).toEqual(['cs_9']);
  });

  it('touches nothing for a charge with nothing refunded or no payment intent', async () => {
    expect(await applyChargeRefund(charge({ amount_refunded: 0 }))).toEqual({
      payments: [],
      clawedBack: 0,
    });
    expect(await applyChargeRefund(charge({ payment_intent: null }))).toEqual({
      payments: [],
      clawedBack: 0,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('says so, and writes nothing, when no recorded payment matches', async () => {
    invoicePaymentsList.mockResolvedValueOnce({ data: [] });
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await applyChargeRefund(charge())).payments).toEqual([]);
    expect(logged).toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
