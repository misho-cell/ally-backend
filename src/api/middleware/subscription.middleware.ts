import { NextFunction, Request, Response } from 'express';
import { query } from '../../db/postgres/client';
import { AuthenticatedRequest } from './auth.middleware';
import { ApiResponse } from '../../types';

/**
 * How long a failed card keeps its access.
 *
 * The founder's ruling (2 Sep) is that a failed payment should let the person
 * try again rather than lock them out: Stripe retries the card on its own
 * schedule and the Customer Portal lets them replace it. Stripe's default
 * Smart Retries run out at about two weeks, and the dashboard is set to cancel
 * the subscription when they do — at which point `canceled` arrives and this
 * window never comes into it.
 *
 * The window exists for the case where that dashboard rule is ever changed to
 * leave a subscription past_due indefinitely. Without it, "leave as past_due"
 * would quietly mean free forever.
 */
const PAST_DUE_GRACE_DAYS = Number(process.env.SUBSCRIPTION_PAST_DUE_GRACE_DAYS ?? 14);
const MS_PER_DAY = 86_400_000;

interface SubscriptionRow {
  readonly subscription_status: string;
  readonly trial_ends_at: string | null;
  readonly current_period_ends_at: string | null;
  readonly subscription_status_changed_at: string | null;
}

/**
 * Is this account still inside the grace period for a failed payment?
 *
 * Measured from when the status last changed, never from the subscription's
 * period end: Stripe rolls the period forward at renewal, so a card that fails
 * on renewal day carries a period end a month into the future.
 *
 * A missing timestamp is not a fresh failure. It means we never recorded the
 * change, and an unknown-age past_due must not open the door on a guess.
 */
function insidePastDueGrace(row: SubscriptionRow, now: Date): boolean {
  if (row.subscription_status_changed_at === null) return false;
  const since = new Date(row.subscription_status_changed_at).getTime();
  if (Number.isNaN(since)) return false;
  return now.getTime() - since < PAST_DUE_GRACE_DAYS * MS_PER_DAY;
}

export function hasActiveSubscription(row: SubscriptionRow, now: Date = new Date()): boolean {
  if (row.subscription_status === 'trialing') {
    return row.trial_ends_at !== null && new Date(row.trial_ends_at) > now;
  }
  if (row.subscription_status === 'active') {
    return row.current_period_ends_at !== null && new Date(row.current_period_ends_at) > now;
  }
  // The one status that is neither paid nor finished. stripe.service.ts counts
  // it as a paying status; this is where that counts for anything.
  if (row.subscription_status === 'past_due') {
    return insidePastDueGrace(row, now);
  }
  return false;
}

export async function requireSubscription(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.userId;
    const result = await query<SubscriptionRow>(
      `SELECT subscription_status, trial_ends_at, current_period_ends_at,
              subscription_status_changed_at
       FROM "User"
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );

    const user = result.rows[0];
    if (!user || !hasActiveSubscription(user)) {
      res.status(403).json({ success: false, error: 'subscription_required' });
      return;
    }

    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[requireSubscription]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
