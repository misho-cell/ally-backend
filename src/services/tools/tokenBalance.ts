import { query } from '../../db/postgres/client';
import { pushTimeZone } from '../pushQuietHours';
import { getWalletSummary } from '../tokenWallet.service';

/**
 * Team task #377 — Ninia, 2 October: asked how many tokens she had left,
 * Netai could not say; it had no way to look. The screen reads
 * GET /billing/tokens, and this tool reads the very same summary, so the
 * number in the reply is the number on the badge.
 */
export interface TokenBalanceAnswer {
  readonly balance: number;
  readonly granted_this_period: number;
  readonly spent_this_period: number;
  readonly resets_at: string | null;
  /** The tester's 1047: the reset in the owner's own clock, e.g. „5 Oct, 04:00 (Asia/Tbilisi)". */
  readonly resets_at_local: string | null;
  readonly note: string;
}

const NOTE =
  'The same numbers the app screen shows. Say the balance as it is; if they ask when tokens come ' +
  'back, say resets_at_local — it is already in their own clock. Never estimate or round.';
const ZONE_TIMEOUT_MS = 3_000;

/** The owner's own clock: their newest device's zone, Tbilisi when none has said. */
async function ownerTimeZone(userId: string): Promise<string> {
  const result = await query<{ time_zone: string | null }>(
    `SELECT time_zone FROM push_subscriptions
      WHERE user_id = $1 AND time_zone IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [userId],
    ZONE_TIMEOUT_MS,
  ).catch(() => ({ rows: [] as Array<{ time_zone: string | null }> }));
  return pushTimeZone(result.rows[0]?.time_zone);
}

export function inZone(iso: string, zone: string): string {
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return `${when} (${zone})`;
}

export async function myTokenBalance(userId: string): Promise<TokenBalanceAnswer> {
  const [summary, zone] = await Promise.all([getWalletSummary(userId), ownerTimeZone(userId)]);
  const resetsAt = summary.resetsAt === '' ? null : summary.resetsAt;
  return {
    balance: summary.balance,
    granted_this_period: summary.grantedThisPeriod,
    spent_this_period: summary.spentThisPeriod,
    resets_at: resetsAt,
    resets_at_local: resetsAt === null ? null : inZone(resetsAt, zone),
    note: NOTE,
  };
}
