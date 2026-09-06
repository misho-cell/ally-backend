import { hasActiveSubscription } from '../subscription.middleware';

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
