const list = jest.fn();
const update = jest.fn();
const apply = jest.fn().mockResolvedValue(undefined);
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../stripe.service', () => ({
  __esModule: true,
  stripeClient: () => ({ subscriptions: { list, update } }),
  isOurPrice: (s: { ours?: boolean }) => s.ours === true,
  applySubscription: (s: unknown) => apply(s),
  subscriptionFacts: (s: { cancel_at_period_end: boolean; cancel_at: number | null }) => ({
    status: 'active',
    cancel_at_period_end: s.cancel_at_period_end,
    cancels_at: s.cancel_at === null ? null : new Date(s.cancel_at * 1000),
    current_period_ends_at: new Date('2026-10-30T00:00:00Z'),
  }),
}));

import { query } from '../../db/postgres/client';
import { CancelRefusal, setPlanEndsAtPeriodEnd } from '../stripeCancel.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const ENDS = Date.parse('2026-10-30T00:00:00Z') / 1000;

function customer(id: string | null): void {
  mockQuery.mockResolvedValueOnce({ rows: [{ stripeCustomerId: id }] } as never);
}

beforeEach(() => jest.clearAllMocks());

/** Team task #497 — Ninia could not cancel; the profile now does it in place. */
describe('cancelling the paid plan', () => {
  it('ends it at the close of the paid period and says until when', async () => {
    customer('cus_1');
    list.mockResolvedValueOnce({
      data: [
        { id: 'sub_x', status: 'active', ours: false },
        { id: 'sub_1', status: 'active', ours: true },
      ],
    });
    update.mockResolvedValueOnce({ id: 'sub_1', cancel_at_period_end: true, cancel_at: ENDS });

    expect(await setPlanEndsAtPeriodEnd('165699', true)).toEqual({
      ok: true,
      cancel_at_period_end: true,
      runs_until: '2026-10-30T00:00:00.000Z',
    });
    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('can be undone, and then renews', async () => {
    customer('cus_1');
    list.mockResolvedValueOnce({ data: [{ id: 'sub_1', status: 'active', ours: true }] });
    update.mockResolvedValueOnce({ id: 'sub_1', cancel_at_period_end: false, cancel_at: null });

    const outcome = await setPlanEndsAtPeriodEnd('165699', false);
    expect(outcome).toEqual({
      ok: true,
      cancel_at_period_end: false,
      runs_until: '2026-10-30T00:00:00.000Z',
    });
    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: false });
  });

  it('touches nothing on a plan the team granted (no Stripe customer)', async () => {
    customer(null);
    expect(await setPlanEndsAtPeriodEnd('165699', true)).toEqual({
      ok: false,
      refusal: CancelRefusal.NoPaidPlan,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('touches nothing when the only subscription is another product’s or already over', async () => {
    customer('cus_1');
    list.mockResolvedValueOnce({
      data: [
        { id: 'sub_x', status: 'active', ours: false },
        { id: 'sub_2', status: 'canceled', ours: true },
      ],
    });
    expect(await setPlanEndsAtPeriodEnd('165699', true)).toEqual({
      ok: false,
      refusal: CancelRefusal.NoPaidPlan,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
