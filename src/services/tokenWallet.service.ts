import { query } from '../db/postgres/client';
import { getPrice } from './costLedger.service';

const WALLET_FLAG = 'token_wallet';
const MONTHLY_GRANT_REASON = 'monthly_grant';
const TRIAL_GRANT_REASON = 'trial_grant';
const CHAT_DEBIT_REASON = 'chat_debit';
const TRIAL_PERIOD_KEY = 'trial';
const PERCENT = 100;

export interface RunAllowance {
  allowed: boolean;
  // null when the wallet is disabled (no balance concept applies).
  balance: number | null;
}

export interface WalletSummary {
  enabled: boolean;
  balance: number;
  grantedThisPeriod: number;
  spentThisPeriod: number;
}

export async function isWalletEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [WALLET_FLAG],
  );
  return result.rows[0]?.enabled === true;
}

export async function getBalance(userId: string): Promise<number> {
  const result = await query<{ balance: string | null }>(
    'SELECT SUM(amount) AS balance FROM token_transactions WHERE user_id = $1',
    [userId],
  );
  return Number(result.rows[0]?.balance ?? 0);
}

/**
 * Lazy granting: called before balance checks. Active subscribers get the
 * monthly grant once per calendar month; trialing users get the one-time
 * trial grant. The partial unique index on (user_id, period_key) makes
 * concurrent calls race-safe (second insert is a no-op).
 */
export async function ensurePeriodGrant(userId: string): Promise<void> {
  const statusResult = await query<{ subscription_status: string }>(
    'SELECT subscription_status FROM "User" WHERE id = $1 AND "deletedAt" IS NULL',
    [userId],
  );
  const status = statusResult.rows[0]?.subscription_status;
  if (status !== 'active' && status !== 'trialing') return;

  if (status === 'active') {
    const grant = await getPrice('tokens.monthly_grant');
    if (grant <= 0) return;
    await query(
      `INSERT INTO token_transactions (user_id, amount, reason, period_key)
       VALUES ($1, $2, $3, 'm:' || to_char(NOW(), 'YYYY-MM'))
       ON CONFLICT (user_id, period_key) WHERE period_key IS NOT NULL DO NOTHING`,
      [userId, Math.floor(grant), MONTHLY_GRANT_REASON],
    );
    return;
  }

  const trialGrant = await getPrice('tokens.trial_grant');
  if (trialGrant <= 0) return;
  await query(
    `INSERT INTO token_transactions (user_id, amount, reason, period_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, period_key) WHERE period_key IS NOT NULL DO NOTHING`,
    [userId, Math.floor(trialGrant), TRIAL_GRANT_REASON, TRIAL_PERIOD_KEY],
  );
}

/**
 * Gate for starting a chat run. When the wallet flag is off everything is
 * allowed (the ledger still measures). When on: grant if due, then require a
 * positive balance. A run in flight may take the balance slightly negative —
 * that is deliberate grace; the next run is what gets blocked.
 */
export async function checkRunAllowance(userId: string): Promise<RunAllowance> {
  if (!(await isWalletEnabled())) {
    return { allowed: true, balance: null };
  }

  await ensurePeriodGrant(userId);
  const balance = await getBalance(userId);
  return { allowed: balance > 0, balance };
}

/**
 * Debit the actual cost of a finished run: sum of the run's ledger events,
 * plus the infra overhead percentage, converted to tokens (ceil — partial
 * cents round up so the budget is never undercharged).
 */
export async function debitRun(userId: string, runId: string): Promise<number> {
  if (!(await isWalletEnabled())) return 0;

  const [costResult, usdPerToken, overheadPct] = await Promise.all([
    query<{ total: string | null }>(
      'SELECT SUM(cost_usd) AS total FROM usage_events WHERE run_id = $1',
      [runId],
    ),
    getPrice('tokens.usd_per_token'),
    getPrice('infra.overhead_pct'),
  ]);

  const costUsd = Number(costResult.rows[0]?.total ?? 0);
  if (costUsd <= 0 || usdPerToken <= 0) return 0;

  const tokens = Math.ceil((costUsd * (1 + overheadPct / PERCENT)) / usdPerToken);
  if (tokens <= 0) return 0;

  await query(
    `INSERT INTO token_transactions (user_id, amount, reason, run_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, -tokens, CHAT_DEBIT_REASON, runId],
  );
  return tokens;
}

/** Balance view for the app (GET /billing/tokens). */
export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const enabled = await isWalletEnabled();
  if (enabled) {
    await ensurePeriodGrant(userId);
  }

  const result = await query<{
    balance: string | null;
    granted: string | null;
    spent: string | null;
  }>(
    `SELECT SUM(amount) AS balance,
            SUM(amount) FILTER (WHERE amount > 0
              AND created_at >= date_trunc('month', NOW()))       AS granted,
            -SUM(amount) FILTER (WHERE amount < 0
              AND created_at >= date_trunc('month', NOW()))       AS spent
     FROM token_transactions
     WHERE user_id = $1`,
    [userId],
  );

  const row = result.rows[0];
  return {
    enabled,
    balance: Number(row?.balance ?? 0),
    grantedThisPeriod: Number(row?.granted ?? 0),
    spentThisPeriod: Number(row?.spent ?? 0),
  };
}
