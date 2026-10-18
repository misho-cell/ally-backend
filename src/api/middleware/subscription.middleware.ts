import { NextFunction, Request, Response } from 'express';
import { query } from '../../db/postgres/client';
import { AuthenticatedRequest } from './auth.middleware';
import { ApiResponse } from '../../types';
import type { Subscription } from '../../services/tokenWallet.service';

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

interface GateRow extends SubscriptionRow {
  readonly subscription_tier: string | null;
  readonly live: boolean;
}

/**
 * 5321 (the tester's 200 run, 18 Oct 00:05Z): the wallet check read the same
 * "User" row this gate had just read, one more trip on every send. The gate
 * leaves the plan here, and the send hands it to `checkRunAllowance`.
 */
const GATE_SUBSCRIPTION = 'gateSubscription';

/** The plan as the wallet reads it: a deleted account has none (its "deletedAt" filter). */
function walletSubscriptionOf(row: GateRow): Subscription {
  return row.live
    ? { status: row.subscription_status, tier: row.subscription_tier ?? '' }
    : { status: undefined, tier: '' };
}

/** The plan this request's gate read, when the gate ran and found the account. */
export function subscriptionReadByGate(res: Response): Subscription | undefined {
  const read: unknown = res.locals[GATE_SUBSCRIPTION];
  if (typeof read !== 'object' || read === null || !('tier' in read)) return undefined;
  const { status, tier } = read as { status?: unknown; tier?: unknown };
  if (typeof tier !== 'string') return undefined;
  if (status !== undefined && typeof status !== 'string') return undefined;
  return { status, tier };
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

async function readGateRow(userId: string): Promise<GateRow | undefined> {
  const result = await query<GateRow>(
    `SELECT subscription_status, trial_ends_at, current_period_ends_at,
            subscription_status_changed_at, subscription_tier,
            ("deletedAt" IS NULL) AS live
     FROM "User"
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );
  return result.rows[0];
}

async function userMayUseProduct(userId: string, res?: Response): Promise<boolean> {
  const user = await readGateRow(userId);
  if (user === undefined) return false;
  if (res !== undefined) res.locals[GATE_SUBSCRIPTION] = walletSubscriptionOf(user);
  return hasActiveSubscription(user);
}

export async function requireSubscription(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.userId;
    if (!(await userMayUseProduct(userId))) {
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

/** The thread types a lapsed account may still open: somebody is asking THEM. */
const ANSWERABLE_WITHOUT_SUBSCRIPTION: ReadonlySet<string> = new Set(['incoming_ask']);
const THREAD_ID_RE = /^\/(\d+)(?:\/|$)/;

/** Is the thread this request addresses one the user may answer unpaid? */
async function isAnswerableThread(userId: string, path: string): Promise<boolean> {
  const match = THREAD_ID_RE.exec(path);
  if (!match) return false;
  const result = await query<{ type: string }>(
    `SELECT type FROM threads WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [Number(match[1]), userId],
  );
  const type = result.rows[0]?.type;
  return type !== undefined && ANSWERABLE_WITHOUT_SUBSCRIPTION.has(type);
}

/**
 * The subscription gate, with one door held open: a thread in which somebody
 * is asking THIS user a question.
 *
 * Ticket 10 Task 25 (b), D123 (7 Sep): a non-paying member can answer and
 * help on a paying member's task. The whole point of asking a friend is that
 * the friend can reply, and a lapsed trial must not turn an incoming question
 * into a paywall on the recipient's phone — the asker paid for that question.
 * Everything else a lapsed account touches still meets the paywall.
 */
export async function requireSubscriptionUnlessAnswering(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.userId;
    if (await userMayUseProduct(userId, res)) {
      next();
      return;
    }
    if (await isAnswerableThread(userId, req.path)) {
      next();
      return;
    }
    res.status(403).json({ success: false, error: 'subscription_required' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[requireSubscriptionUnlessAnswering]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
