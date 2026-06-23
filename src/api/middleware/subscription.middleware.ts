import { NextFunction, Request, Response } from 'express';
import { query } from '../../db/postgres/client';
import { AuthenticatedRequest } from './auth.middleware';
import { ApiResponse } from '../../types';

interface SubscriptionRow {
  readonly subscription_status: string;
  readonly trial_ends_at: string | null;
  readonly current_period_ends_at: string | null;
}

function hasActiveSubscription(row: SubscriptionRow): boolean {
  const now = new Date();
  if (row.subscription_status === 'trialing') {
    return row.trial_ends_at !== null && new Date(row.trial_ends_at) > now;
  }
  if (row.subscription_status === 'active') {
    return row.current_period_ends_at !== null && new Date(row.current_period_ends_at) > now;
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
      `SELECT subscription_status, trial_ends_at, current_period_ends_at
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
