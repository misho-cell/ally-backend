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
  readonly note: string;
}

const NOTE =
  'The same numbers the app screen shows. Say the balance as it is; if they ask when tokens come ' +
  'back, give resets_at in their own words and time zone if known. Never estimate or round.';

export async function myTokenBalance(userId: string): Promise<TokenBalanceAnswer> {
  const summary = await getWalletSummary(userId);
  return {
    balance: summary.balance,
    granted_this_period: summary.grantedThisPeriod,
    spent_this_period: summary.spentThisPeriod,
    resets_at: summary.resetsAt === '' ? null : summary.resetsAt,
    note: NOTE,
  };
}
