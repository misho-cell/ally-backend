jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

const mockSubscriptionsRetrieve = jest.fn();
const mockDistribute = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({ subscriptions: { retrieve: mockSubscriptionsRetrieve } })),
);
jest.mock('../referral.service', () => ({
  __esModule: true,
  distributeReferralEarnings: (...args: unknown[]) => mockDistribute(...args),
  oneMonthOfUsd: jest.requireActual('../referral.service').oneMonthOfUsd,
}));

/**
 * Misho, 3 October: Stripe pays the 5% referral reward, as Paddle did. The same
 * once-per-subscriber service, called on a paid subscription invoice with real
 * money, keyed on the invoice id so a webhook retry pays nothing twice.
 */
const OUR_PRICE = 'price_ours';

function paidInvoice(over: Record<string, unknown> = {}): unknown {
  return {
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_1',
        subscription: 'sub_1',
        amount_paid: 1999,
        currency: 'usd',
        created: 1_800_000_000,
        ...over,
      },
    },
  };
}

let stripeService: typeof import('../stripe.service');

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRICE_ID = OUR_PRICE;
  process.env.STRIPE_TIER = 'premium';
  stripeService = await import('../stripe.service');
  const { query } = await import('../../db/postgres/client');
  (query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
  mockDistribute.mockResolvedValue(1);
  mockSubscriptionsRetrieve.mockResolvedValue({
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: { user_id: '42' },
    trial_end: null,
    items: { data: [{ price: { id: OUR_PRICE }, current_period_end: 1_800_500_000 }] },
  });
});

describe('a Stripe subscription payment pays the inviter chain', () => {
  it('pays the shares on a paid invoice, in dollars, keyed on the invoice', async () => {
    await stripeService.handleStripeEvent(paidInvoice() as never);

    expect(mockDistribute).toHaveBeenCalledWith('42', 19.99, 'in_1');
  });

  /** D693: an annual invoice is counted as one month of it. */
  it('counts an annual invoice as one month of it', async () => {
    const year = { start: 1_800_000_000, end: 1_800_000_000 + 365 * 86_400 };
    await stripeService.handleStripeEvent(
      paidInvoice({ amount_paid: 19_990, lines: { data: [{ period: year }] } }) as never,
    );

    expect(mockDistribute).toHaveBeenCalledWith('42', expect.closeTo(16.66, 1), 'in_1');
  });

  it('pays nothing for the $0 invoice that opens a trial', async () => {
    await stripeService.handleStripeEvent(paidInvoice({ id: 'in_0', amount_paid: 0 }) as never);

    expect(mockDistribute).not.toHaveBeenCalled();
  });

  it('pays nothing in another currency rather than guess a rate', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await stripeService.handleStripeEvent(paidInvoice({ currency: 'gel' }) as never);

    expect(mockDistribute).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never fails the webhook when the shares cannot be paid', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDistribute.mockRejectedValue(new Error('db down'));

    await expect(stripeService.handleStripeEvent(paidInvoice() as never)).resolves.toEqual({
      handled: true,
      type: 'invoice.paid',
    });
    error.mockRestore();
  });
});
