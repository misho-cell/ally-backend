jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../../db/postgres/client';
import {
  hasActiveSubscription,
  requireSubscription,
  requireSubscriptionUnlessAnswering,
} from '../subscription.middleware';

const mockQuery = query as jest.MockedFunction<typeof query>;

const NOW = new Date('2026-09-06T12:00:00Z');

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

function row(over: Partial<Parameters<typeof hasActiveSubscription>[0]> = {}) {
  return {
    subscription_status: 'inactive',
    trial_ends_at: null,
    current_period_ends_at: null,
    subscription_status_changed_at: null,
    ...over,
  };
}

describe('who may use the product', () => {
  it('a running trial is access; an expired one is not', () => {
    expect(
      hasActiveSubscription(
        row({ subscription_status: 'trialing', trial_ends_at: daysFromNow(3) }),
        NOW,
      ),
    ).toBe(true);
    expect(
      hasActiveSubscription(
        row({ subscription_status: 'trialing', trial_ends_at: daysFromNow(-1) }),
        NOW,
      ),
    ).toBe(false);
  });

  it('a paid period is access until the day it ends', () => {
    expect(
      hasActiveSubscription(
        row({ subscription_status: 'active', current_period_ends_at: daysFromNow(20) }),
        NOW,
      ),
    ).toBe(true);
    expect(
      hasActiveSubscription(
        row({ subscription_status: 'active', current_period_ends_at: daysFromNow(-1) }),
        NOW,
      ),
    ).toBe(false);
  });

  // The founder's ruling on a failed card: let them try again. stripe.service
  // has always counted past_due as a paying status; before this it counted for
  // nothing, because this gate refused it and this gate is what every route
  // asks.
  it('a card that just failed keeps its access', () => {
    expect(
      hasActiveSubscription(
        row({ subscription_status: 'past_due', subscription_status_changed_at: daysFromNow(-2) }),
        NOW,
      ),
    ).toBe(true);
  });

  it('but not forever — the grace window ends', () => {
    expect(
      hasActiveSubscription(
        row({ subscription_status: 'past_due', subscription_status_changed_at: daysFromNow(-15) }),
        NOW,
      ),
    ).toBe(false);
  });

  // Stripe rolls the period forward at renewal, so a card failing on renewal
  // day carries a period end a MONTH ahead. Anchoring the grace there would
  // hand out a free month; the status-change stamp is the only honest clock.
  it('the grace is counted from the failure, not from the period end', () => {
    expect(
      hasActiveSubscription(
        row({
          subscription_status: 'past_due',
          current_period_ends_at: daysFromNow(28),
          subscription_status_changed_at: daysFromNow(-20),
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('an unknown-age past_due is refused rather than guessed at', () => {
    expect(
      hasActiveSubscription(
        row({ subscription_status: 'past_due', subscription_status_changed_at: null }),
        NOW,
      ),
    ).toBe(false);
  });

  it('the statuses Stripe uses to say it gave up are the end of access', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'inactive']) {
      expect(
        hasActiveSubscription(
          row({
            subscription_status: status,
            current_period_ends_at: daysFromNow(30),
            subscription_status_changed_at: daysFromNow(0),
          }),
          NOW,
        ),
      ).toBe(false);
    }
  });
});

// Ticket 10 Task 25 (b), D123: a lapsed account may still open and answer a
// thread in which somebody is asking THEM — everything else meets the paywall.
describe('the gate with one door held open', () => {
  type Res = { status: jest.Mock; json: jest.Mock };
  function res(): Res {
    const r: Res = { status: jest.fn(), json: jest.fn() };
    r.status.mockReturnValue(r);
    return r;
  }
  function req(path: string): { user: { userId: string }; path: string } {
    return { user: { userId: '77' }, path };
  }
  const lapsed = {
    subscription_status: 'inactive',
    trial_ends_at: null,
    current_period_ends_at: null,
    subscription_status_changed_at: null,
  };
  const paying = {
    ...lapsed,
    subscription_status: 'active',
    current_period_ends_at: daysFromNow(10),
  };

  beforeEach(() => jest.clearAllMocks());

  it('a paying account passes both gates without a thread lookup', async () => {
    mockQuery.mockResolvedValue({ rows: [paying], rowCount: 1 } as never);
    const next = jest.fn();

    await requireSubscriptionUnlessAnswering(req('/9412/message') as never, res() as never, next);

    expect(next).toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('a lapsed account may answer an incoming ask', async () => {
    mockQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        (sql.includes('FROM threads')
          ? { rows: [{ type: 'incoming_ask' }], rowCount: 1 }
          : { rows: [lapsed], rowCount: 1 }) as never,
      ),
    );
    const next = jest.fn();

    await requireSubscriptionUnlessAnswering(req('/9412/message') as never, res() as never, next);

    expect(next).toHaveBeenCalled();
    const threadCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('FROM threads'));
    expect(threadCall?.[1]).toEqual([9412, '77']);
  });

  it('a lapsed account meets the paywall on its own goal thread, and on the list', async () => {
    mockQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        (sql.includes('FROM threads')
          ? { rows: [{ type: 'regular' }], rowCount: 1 }
          : { rows: [lapsed], rowCount: 1 }) as never,
      ),
    );
    const next = jest.fn();
    const r1 = res();
    await requireSubscriptionUnlessAnswering(req('/9412/message') as never, r1 as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(r1.status).toHaveBeenCalledWith(403);
    expect(r1.json).toHaveBeenCalledWith({ success: false, error: 'subscription_required' });

    const r2 = res();
    await requireSubscriptionUnlessAnswering(req('/') as never, r2 as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(r2.status).toHaveBeenCalledWith(403);
  });

  it('the plain gate still refuses a lapsed account everywhere', async () => {
    mockQuery.mockResolvedValue({ rows: [lapsed], rowCount: 1 } as never);
    const next = jest.fn();
    const r = res();

    await requireSubscription(req('/9412/message') as never, r as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
  });
});
