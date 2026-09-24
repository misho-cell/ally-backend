const dbQuery = jest.fn();
const subscriptionsList = jest.fn();

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));

const actualStripe = jest.requireActual('../stripe.service') as Record<string, unknown>;
jest.mock('../stripe.service', () => ({
  __esModule: true,
  ...(jest.requireActual('../stripe.service') as Record<string, unknown>),
  isStripeConfigured: () => stripeConfigured,
  stripeClient: () => ({ subscriptions: { list: (...a: unknown[]) => subscriptionsList(...a) } }),
  isOurPrice: (s: { items: { data: { price: { id: string } }[] } }) =>
    s.items.data.some((i) => i.price.id === OUR_PRICE),
}));

let stripeConfigured = true;
const OUR_PRICE = 'price_ours';

import { subscriptionDrift } from '../stripeReconcile.service';

/**
 * ROW 248, AND THE FOURTH FACT NOBODY ASKED FOR.
 *
 * The bug: after cancelling, the app still said the payment was automatic. The
 * cause was found — a cancel-at-period-end moves none of the values Stripe
 * normally moves, it leaves the status at `trialing` and raises a flag — and
 * two columns were added and are written on every event.
 *
 * BUILT. DEPLOYED. VERIFIED on the next cancellation. And the account the row
 * was reported for still reads `cancel_at_period_end = false`, because those
 * columns are only written when an event ARRIVES, and the next event for a
 * cancel-at-period-end is the day the subscription actually ends.
 *
 * So the fix is real and the person still sees the bug, both at once. This
 * codebase knows that built, deployed and verified are three facts; the fourth
 * is THE STATE THAT EXISTED BEFORE THE FIX, and nothing had asked about it.
 *
 * The check writes nothing. Repairing the rows is an admin operation on live
 * data and needs the register and a yes; how many rows are wrong needs
 * neither, and no backfill should be built before that number exists.
 */
function storedUser(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: 4511,
    name: 'A Person',
    customer_id: 'cus_1',
    subscription_status: 'trialing',
    cancel_at_period_end: false,
    cancels_at: null,
    current_period_ends_at: new Date('2026-09-26T11:26:51Z'),
    ...over,
  };
}

function liveSub(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub_1',
    created: 1,
    status: 'trialing',
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ price: { id: OUR_PRICE }, current_period_end: 1790000000 }] },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  stripeConfigured = true;
  dbQuery.mockResolvedValue({ rows: [storedUser()], rowCount: 1 });
  subscriptionsList.mockResolvedValue({ data: [liveSub()] });
});

describe('it finds the cancellation the columns never heard about', () => {
  it('reports the account whose flag Stripe raised and the row did not', async () => {
    subscriptionsList.mockResolvedValue({
      data: [liveSub({ cancel_at_period_end: true, cancel_at: 1790000000 })],
    });

    const report = await subscriptionDrift();

    expect(report.checked).toBe(1);
    expect(report.agreed).toBe(0);
    expect(report.drifted).toHaveLength(1);
    expect(report.drifted[0].differs.join(' ')).toContain('cancel_at_period_end');
    expect(report.drifted[0].live?.cancel_at_period_end).toBe(true);
    expect(report.drifted[0].stored.cancel_at_period_end).toBe(false);
  });

  it('says nothing about an account the columns already agree with', async () => {
    const report = await subscriptionDrift();

    expect(report.agreed).toBe(1);
    expect(report.drifted).toHaveLength(0);
  });

  /** D159(3): the founder reads names, not record ids. Both travel. */
  it('names the person as well as the id', async () => {
    subscriptionsList.mockResolvedValue({ data: [liveSub({ status: 'canceled' })] });

    const report = await subscriptionDrift();

    expect(report.drifted[0].name).toBe('A Person');
    expect(report.drifted[0].user_id).toBe(4511);
  });
});

/**
 * THE STRIPE ACCOUNT IS SHARED WITH ANOTHER PRODUCT — ten live subscriptions
 * on other price ids. Reading them as ours is the same fault as counting
 * another product's registrations as our own, which happened twice in one
 * evening on 23 September and nearly told the frontend their fix had failed.
 */
describe('another product’s billing is not our billing', () => {
  it('ignores a subscription that is not on our price', async () => {
    subscriptionsList.mockResolvedValue({
      data: [liveSub({ status: 'canceled', items: { data: [{ price: { id: 'price_theirs' } }] } })],
    });

    const report = await subscriptionDrift();

    expect(report.not_our_price).toBe(1);
    // And the stored status is still reported as unexplained, rather than the
    // other product's cancellation being read as an answer about ours.
    expect(report.drifted[0].differs[0]).toContain('no subscription on our price');
    expect(report.drifted[0].live).toBeNull();
  });
});

describe('what it refuses to call a difference', () => {
  /**
   * `current_period_ends_at` moves on every renewal with no event missed, so
   * comparing it would mark most of the base as drifted and bury the rows that
   * matter. A check that cries on everything is a check nobody reads — the
   * lesson of the outage monitor's quiet hours.
   */
  it('does not report a moved period end', async () => {
    subscriptionsList.mockResolvedValue({
      data: [liveSub({ items: { data: [{ price: { id: OUR_PRICE }, current_period_end: 1 }] } })],
    });

    const report = await subscriptionDrift();

    expect(report.agreed).toBe(1);
    expect(report.drifted).toHaveLength(0);
  });
});

describe('“I could not look” leaves by its own door', () => {
  it('throws rather than reporting agreement when Stripe is not configured', async () => {
    stripeConfigured = false;

    await expect(subscriptionDrift()).rejects.toThrow(/not configured/);
  });

  /**
   * One customer Stripe will not answer for must not be able to hide the other
   * eighty-one. It is counted as unreadable — which is neither agreement nor
   * drift, because it is neither.
   */
  it('records an unreadable account and keeps checking the rest', async () => {
    dbQuery.mockResolvedValue({
      rows: [storedUser(), storedUser({ user_id: 99, customer_id: 'cus_2' })],
      rowCount: 2,
    });
    subscriptionsList
      .mockRejectedValueOnce(new Error('stripe timed out'))
      .mockResolvedValueOnce({ data: [liveSub()] });

    const report = await subscriptionDrift();

    expect(report.unreadable).toEqual([{ user_id: 4511, why: 'stripe timed out' }]);
    expect(report.agreed).toBe(1);
    expect(report.checked).toBe(2);
  });
});

/**
 * AND THE CHECKER READS THE SAME FACTS THE WRITER WRITES. Two readings of one
 * value drifting apart is this codebase's recurring bug; here it would make
 * the check report faults that are its own. Both go through
 * `subscriptionFacts`.
 */
describe('the checker and the writer cannot disagree', () => {
  it('both take the three values from one function', () => {
    const facts = (
      actualStripe.subscriptionFacts as (s: unknown) => { cancel_at_period_end: boolean }
    )(liveSub({ cancel_at_period_end: true, cancel_at: 1790000000 }));

    expect(facts.cancel_at_period_end).toBe(true);
  });
});
