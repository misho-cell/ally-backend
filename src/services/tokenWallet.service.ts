import { query } from '../db/postgres/client';
import { getPrice } from './costLedger.service';
import { budgetWindow } from './budgetWindow';

const WALLET_FLAG = 'token_wallet';
const MONTHLY_GRANT_REASON = 'monthly_grant';
const TRIAL_GRANT_REASON = 'trial_grant';
const CHAT_DEBIT_REASON = 'chat_debit';
const TOPUP_REASON = 'topup';
const GRANT_EXPIRY_REASON = 'grant_expiry';
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
  /** The window the grant counts in (D124): calendar_month or calendar_week. */
  window: 'calendar_month' | 'calendar_week';
  /** When the allowance resets — the screen's „renews" date for tokens (Ticket 12 Task 34). */
  resetsAt: string;
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
 * Lazy granting: called before balance checks. Active subscribers get their
 * tier's monthly grant once per calendar month (pro 1000 / enterprise 5500 /
 * premium 1000, all editable in provider_prices; the tierless key is the
 * fallback for unknown tiers). Trialing users get the one-time trial grant.
 * The partial unique index on (user_id, period_key) makes concurrent calls
 * race-safe (second insert is a no-op).
 */
export async function ensurePeriodGrant(userId: string): Promise<void> {
  const statusResult = await query<{ subscription_status: string; subscription_tier: string }>(
    'SELECT subscription_status, subscription_tier FROM "User" WHERE id = $1 AND "deletedAt" IS NULL',
    [userId],
  );
  const status = statusResult.rows[0]?.subscription_status;
  if (status !== 'active' && status !== 'trialing') return;

  if (status === 'active') {
    const tier = statusResult.rows[0]?.subscription_tier ?? '';
    // The window decides which grant is read and which key the row carries
    // (Ticket 10 Task 25 (c), D124): tokens.monthly_grant under 'm:YYYY-MM' by
    // default, tokens.weekly_grant under 'w:IYYY-Www' when BUDGET_WINDOW=week.
    const window = budgetWindow();
    const tierGrant = tier ? await getPrice(`${window.grantPriceKey}.${tier}`) : 0;
    const grant = tierGrant > 0 ? tierGrant : await getPrice(window.grantPriceKey);
    if (grant <= 0) return;
    await query(
      `INSERT INTO token_transactions (user_id, amount, reason, period_key)
       VALUES ($1, $2, $3, ${window.currentKeySql})
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
 * Monthly grants expire: at the first wallet touch of a new month, the unused
 * part of each past month's grant is burned with a grant_expiry transaction.
 * Spending counts against the grant first, so purchased/top-up/admin tokens
 * survive rollover. The exp:<YYYY-MM> period key rides the same unique index
 * as grants — concurrent settles can only burn once, and a written marker
 * (even a zero one) stops the month from being re-evaluated.
 */
export async function expireStaleGrants(userId: string): Promise<void> {
  // Only grants of the window in force are compared against the current key
  // — 'm:' keys against the month, 'w:' keys against the week — so switching
  // the window (D124) never burns a grant of the other kind by string order.
  const window = budgetWindow();
  const stale = await query<{ period_key: string; amount: number }>(
    `SELECT period_key, amount
     FROM token_transactions t
     WHERE user_id = $1 AND reason = $2
       AND period_key LIKE $3 || '%'
       AND period_key < ${window.currentKeySql}
       AND NOT EXISTS (
         SELECT 1 FROM token_transactions e
         WHERE e.user_id = $1
           AND e.period_key = 'exp:' || substring(t.period_key FROM 3)
       )`,
    [userId, MONTHLY_GRANT_REASON, window.keyPrefix],
  );

  for (const grant of stale.rows) {
    const period = grant.period_key.slice(window.keyPrefix.length);
    const [debitsResult, balance] = await Promise.all([
      query<{ spent: string | null }>(
        `SELECT -SUM(amount) AS spent
         FROM token_transactions
         WHERE user_id = $1 AND amount < 0 AND reason <> $3
           AND created_at >= ${window.periodStartSql}
           AND created_at <  ${window.periodEndSql}`,
        [userId, period, GRANT_EXPIRY_REASON],
      ),
      getBalance(userId),
    ]);

    const spent = Number(debitsResult.rows[0]?.spent ?? 0);
    const leftover = Math.max(0, Number(grant.amount) - spent);
    const burn = Math.min(leftover, Math.max(0, balance));
    const amount = burn > 0 ? -burn : 0;

    await query(
      `INSERT INTO token_transactions (user_id, amount, reason, period_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, period_key) WHERE period_key IS NOT NULL DO NOTHING`,
      [userId, amount, GRANT_EXPIRY_REASON, 'exp:' + period],
    );
  }
}

/**
 * Gate for starting a chat run. When the wallet flag is off everything is
 * allowed (the ledger still measures). When on: settle expiries, grant if
 * due, then require a positive balance. A run in flight may take the balance
 * slightly negative — that is deliberate grace; the next run gets blocked.
 */
export async function checkRunAllowance(userId: string): Promise<RunAllowance> {
  if (!(await isWalletEnabled())) {
    return { allowed: true, balance: null };
  }

  await expireStaleGrants(userId);
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

  // One debit per run (Task 25 (e), migration 126): a retried settle is a
  // no-op, never a second charge. Zero rows written = nothing debited now.
  const result = await query(
    `INSERT INTO token_transactions (user_id, amount, reason, run_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (run_id) WHERE reason = 'chat_debit' AND run_id IS NOT NULL DO NOTHING`,
    [userId, -tokens, CHAT_DEBIT_REASON, runId],
  );
  return (result.rowCount ?? 0) > 0 ? tokens : 0;
}

export interface TopupPackage {
  id: number;
  paddlePriceId: string;
  tokens: number;
  label: string;
  // USD price of the package — what a referral-balance purchase costs.
  priceUsd: number | null;
}

export async function listTopupPackages(): Promise<TopupPackage[]> {
  const result = await query<{
    id: number;
    paddle_price_id: string;
    tokens: number;
    label: string;
    price_usd: string | null;
  }>(
    `SELECT id, paddle_price_id, tokens, label, price_usd
     FROM topup_packages WHERE active = true ORDER BY tokens ASC`,
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    paddlePriceId: r.paddle_price_id,
    tokens: Number(r.tokens),
    label: r.label,
    priceUsd: r.price_usd === null ? null : Number(r.price_usd),
  }));
}

export async function findTopupPackageByPriceId(priceId: string): Promise<TopupPackage | null> {
  const result = await query<{
    id: number;
    paddle_price_id: string;
    tokens: number;
    label: string;
    price_usd: string | null;
  }>(
    `SELECT id, paddle_price_id, tokens, label, price_usd
     FROM topup_packages WHERE paddle_price_id = $1 AND active = true LIMIT 1`,
    [priceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    paddlePriceId: row.paddle_price_id,
    tokens: Number(row.tokens),
    label: row.label,
    priceUsd: row.price_usd === null ? null : Number(row.price_usd),
  };
}

/**
 * Credit a purchased top-up. Idempotent by external id (the Paddle transaction
 * id) — webhook retries insert nothing. Returns whether tokens were credited.
 */
export async function creditTopup(
  userId: string,
  tokens: number,
  externalId: string,
): Promise<boolean> {
  if (tokens <= 0) return false;
  const result = await query(
    `INSERT INTO token_transactions (user_id, amount, reason, external_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING`,
    [userId, Math.floor(tokens), TOPUP_REASON, externalId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Balance view for the app (GET /billing/tokens). */
export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  const enabled = await isWalletEnabled();
  if (enabled) {
    await expireStaleGrants(userId);
    await ensurePeriodGrant(userId);
  }

  const window = budgetWindow();
  const result = await query<{
    balance: string | null;
    granted: string | null;
    spent: string | null;
    resets_at: string | Date;
  }>(
    `SELECT SUM(amount) AS balance,
            SUM(amount) FILTER (WHERE amount > 0
              AND created_at >= ${window.windowStartSql})       AS granted,
            -SUM(amount) FILTER (WHERE amount < 0 AND reason <> $2
              AND created_at >= ${window.windowStartSql})       AS spent,
            (${window.windowResetSql}) AS resets_at
     FROM token_transactions
     WHERE user_id = $1`,
    [userId, GRANT_EXPIRY_REASON],
  );

  const row = result.rows[0];
  const resets = row?.resets_at instanceof Date ? row.resets_at : new Date(row?.resets_at ?? NaN);
  return {
    enabled,
    balance: Number(row?.balance ?? 0),
    grantedThisPeriod: Number(row?.granted ?? 0),
    spentThisPeriod: Number(row?.spent ?? 0),
    window: window.label,
    resetsAt: Number.isNaN(resets.getTime()) ? '' : resets.toISOString(),
  };
}
