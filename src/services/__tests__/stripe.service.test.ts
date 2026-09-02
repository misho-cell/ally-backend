jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

const mockSubscriptionsRetrieve = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCheckoutCreate = jest.fn();
const mockPortalCreate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
  }));
});

import type { query as QueryFn } from '../../db/postgres/client';

// Re-acquired after every resetModules: the service reads its config at module
// load, so each test imports it fresh — and a fresh import brings a fresh copy
// of the mocked client with it. Holding the old reference silently mocks
// nothing.
let mockQuery: jest.MockedFunction<typeof QueryFn>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const OUR_PRICE = 'price_ours';

function subscription(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub_1',
    status: 'trialing',
    customer: 'cus_1',
    metadata: { user_id: '42' },
    trial_end: 1_800_000_000,
    items: { data: [{ price: { id: OUR_PRICE }, current_period_end: 1_800_500_000 }] },
    ...over,
  };
}

let stripeService: typeof import('../stripe.service');

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRICE_ID = OUR_PRICE;
  process.env.STRIPE_TIER = 'premium';
  process.env.STRIPE_TRIAL_DAYS = '5';
  stripeService = await import('../stripe.service');
  mockQuery = (await import('../../db/postgres/client')).query as jest.MockedFunction<
    typeof QueryFn
  >;
  mockQuery.mockResolvedValue(rows([]) as never);
});

describe('handleStripeEvent — writing Stripe truth onto the account', () => {
  function userUpdate(): unknown[] | undefined {
    return mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('SET subscription_status'),
    )?.[1] as unknown[] | undefined;
  }

  it('a trialing subscription grants premium and records the trial as consumed', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT u.id'))
        return Promise.resolve(rows([{ id: 42, phone: '+995599000001' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await stripeService.handleStripeEvent({
      type: 'customer.subscription.created',
      data: { object: subscription() },
    } as never);

    const params = userUpdate();
    expect(params?.[0]).toBe('trialing');
    expect(params?.[1]).toBe(true); // grants the tier
    expect(params?.[2]).toBe('premium');
    // One trial per person, keyed by phone so a deleted account cannot reset it.
    const consumed = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO stripe_trial_consumed'),
    );
    expect(consumed?.[1]?.[0]).toBe('995599000001');
  });

  it('past_due keeps access — the person is meant to be able to retry', async () => {
    await stripeService.handleStripeEvent({
      type: 'customer.subscription.updated',
      data: { object: subscription({ status: 'past_due', trial_end: null }) },
    } as never);

    const params = userUpdate();
    expect(params?.[0]).toBe('past_due');
    expect(params?.[1]).toBe(true);
  });

  it('a canceled subscription writes the status but never clears the tier', async () => {
    await stripeService.handleStripeEvent({
      type: 'customer.subscription.deleted',
      data: { object: subscription({ status: 'canceled', trial_end: null }) },
    } as never);

    const params = userUpdate();
    expect(params?.[0]).toBe('canceled');
    // false = the CASE leaves subscription_tier as it was. Access is decided by
    // status everywhere else, and the tier is what the founder hand-set for the
    // people he is migrating by hand.
    expect(params?.[1]).toBe(false);
  });

  it("ignores another product's subscription on the same Stripe account", async () => {
    // The account carries 10 live $1.99/month subscriptions belonging to a
    // different product. Their events reach this endpoint too.
    await stripeService.handleStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: subscription({
          items: { data: [{ price: { id: 'price_other_product' }, current_period_end: 1 }] },
        }),
      },
    } as never);

    expect(userUpdate()).toBeUndefined();
  });

  it('touches no account when the subscription matches nobody', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockResolvedValue(rows([]) as never);

    await stripeService.handleStripeEvent({
      type: 'customer.subscription.updated',
      data: { object: subscription({ metadata: {} }) },
    } as never);

    expect(userUpdate()).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('an unrelated event is reported as unhandled, not failed', async () => {
    const out = await stripeService.handleStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: {} },
    } as never);

    expect(out).toEqual({ handled: false, type: 'payment_intent.succeeded' });
  });
});

describe('createCheckoutSession — one trial per person', () => {
  it('gives a first-time subscriber the 5-day trial', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT u.id'))
        return Promise.resolve(rows([{ id: 42, phone: '+995599000001' }]) as never);
      if (sql.includes('stripe_trial_consumed')) return Promise.resolve(rows([]) as never);
      if (sql.includes('"stripeCustomerId"'))
        return Promise.resolve(rows([{ stripeCustomerId: 'cus_1' }]) as never);
      return Promise.resolve(rows([]) as never);
    });
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/x' });

    const out = await stripeService.createCheckoutSession('42');

    expect(out.trial_days).toBe(5);
    expect(mockCheckoutCreate.mock.calls[0][0].subscription_data.trial_period_days).toBe(5);
    // The card is taken up front even though nothing is charged yet.
    expect(mockCheckoutCreate.mock.calls[0][0].payment_method_collection).toBe('always');
  });

  it('gives a returning person no second trial', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT u.id'))
        return Promise.resolve(rows([{ id: 42, phone: '+995599000001' }]) as never);
      if (sql.includes('stripe_trial_consumed'))
        return Promise.resolve(rows([{ phone_digits: '995599000001' }]) as never);
      if (sql.includes('"stripeCustomerId"'))
        return Promise.resolve(rows([{ stripeCustomerId: 'cus_1' }]) as never);
      return Promise.resolve(rows([]) as never);
    });
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/x' });

    const out = await stripeService.createCheckoutSession('42');

    expect(out.trial_days).toBe(0);
    expect(mockCheckoutCreate.mock.calls[0][0].subscription_data.trial_period_days).toBeUndefined();
  });
});
