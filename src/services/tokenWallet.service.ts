import { query, withTransaction } from '../db/postgres/client';
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
  /** 4294 (plate NEW-3): the newest credit — the period's grant, a bought pack or the trial's. */
  lastTopUp: LastTopUp | null;
  /**
   * 2047 (box 53263): what an active plan adds every window, and 0 for anyone
   * else. grantedThisPeriod is every credit in the window — a seat's opening
   * 500 plus the week's 250 read as „750 every week".
   */
  allowancePerPeriod: number;
}

export enum TopUpKind {
  Grant = 'grant',
  Topup = 'topup',
  Trial = 'trial',
}

export interface LastTopUp {
  readonly amount: number;
  readonly at: string;
  readonly kind: TopUpKind;
}

const KIND_OF_REASON: Readonly<Record<string, TopUpKind>> = {
  [MONTHLY_GRANT_REASON]: TopUpKind.Grant,
  [TOPUP_REASON]: TopUpKind.Topup,
  [TRIAL_GRANT_REASON]: TopUpKind.Trial,
};

/**
 * 4294 (plate NEW-3): the wallet showed the period's totals only, so after a
 * weekly top-up the screen could not say how much came in, or when. The
 * newest credit of the three kinds, read as it was written.
 */
export async function lastTopUp(userId: string): Promise<LastTopUp | null> {
  const result = await query<{ amount: string; created_at: Date | string; reason: string }>(
    `SELECT amount, created_at, reason FROM token_transactions
      WHERE user_id = $1 AND amount > 0 AND reason = ANY($2::text[])
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [userId, Object.keys(KIND_OF_REASON)],
  );
  const row = result.rows[0];
  const kind = row === undefined ? undefined : KIND_OF_REASON[row.reason];
  if (row === undefined || kind === undefined) return null;
  const at = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  return { amount: Number(row.amount), at: at.toISOString(), kind };
}

export async function isWalletEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [WALLET_FLAG],
  );
  return result.rows[0]?.enabled === true;
}

/**
 * 5321: the flag is read at most every half minute on the accept path — one
 * trip fewer per message. A switch takes effect within that half minute.
 */
const WALLET_FLAG_TTL_MS = 30_000;
let walletFlag: { readonly enabled: boolean; readonly readAt: number } | null = null;

async function walletEnabledRecently(): Promise<boolean> {
  const now = Date.now();
  if (walletFlag !== null && now - walletFlag.readAt < WALLET_FLAG_TTL_MS)
    return walletFlag.enabled;
  const enabled = await isWalletEnabled();
  walletFlag = { enabled, readAt: now };
  return enabled;
}

/** For tests: forget the flag read. */
export function clearWalletFlagCache(): void {
  walletFlag = null;
}

export async function getBalance(userId: string): Promise<number> {
  const result = await query<{ balance: string | null }>(
    'SELECT SUM(amount) AS balance FROM token_transactions WHERE user_id = $1',
    [userId],
  );
  return Number(result.rows[0]?.balance ?? 0);
}

interface Subscription {
  readonly status: string | undefined;
  readonly tier: string;
}

async function subscriptionOf(userId: string): Promise<Subscription> {
  const result = await query<{ subscription_status: string; subscription_tier: string }>(
    'SELECT subscription_status, subscription_tier FROM "User" WHERE id = $1 AND "deletedAt" IS NULL',
    [userId],
  );
  return {
    status: result.rows[0]?.subscription_status,
    tier: result.rows[0]?.subscription_tier ?? '',
  };
}

/**
 * The grant an active subscriber of this tier gets each window. The window
 * decides which grant is read (Ticket 10 Task 25 (c), D124): the plan's
 * monthly tokens, a quarter of them when BUDGET_WINDOW=week.
 */
async function periodGrantFor(tier: string): Promise<number> {
  const window = budgetWindow();
  const tierGrant = tier ? await getPrice(`${window.grantPriceKey}.${tier}`) : 0;
  const monthly = tierGrant > 0 ? tierGrant : await getPrice(window.grantPriceKey);
  return Math.floor(monthly / window.grantShareOfMonth);
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
  await grantWhatIsDue(userId, await subscriptionOf(userId));
}

/** The grant itself, for a subscription already read. */
/** The grant this subscription is owed in the current period, or null when none is. */
interface DueGrant {
  readonly amount: number;
  readonly reason: string;
  /** The period key, as SQL: the window's current key, or the trial's fixed one ($4). */
  readonly keySql: string;
  readonly keyParam: string | null;
}

async function dueGrant(subscription: Subscription): Promise<DueGrant | null> {
  const { status, tier } = subscription;
  if (status === 'active') {
    const grant = await periodGrantFor(tier);
    return grant <= 0
      ? null
      : {
          amount: grant,
          reason: MONTHLY_GRANT_REASON,
          keySql: budgetWindow().currentKeySql,
          keyParam: null,
        };
  }
  if (status !== 'trialing') return null;
  const trialGrant = await getPrice('tokens.trial_grant');
  return trialGrant <= 0
    ? null
    : {
        amount: Math.floor(trialGrant),
        reason: TRIAL_GRANT_REASON,
        keySql: '$4',
        keyParam: TRIAL_PERIOD_KEY,
      };
}

function grantParams(userId: string, grant: DueGrant): unknown[] {
  return [userId, grant.amount, grant.reason, ...(grant.keyParam === null ? [] : [grant.keyParam])];
}

async function grantWhatIsDue(userId: string, subscription: Subscription): Promise<void> {
  const grant = await dueGrant(subscription);
  if (grant === null) return;
  await query(
    `INSERT INTO token_transactions (user_id, amount, reason, period_key)
     VALUES ($1, $2, $3, ${grant.keySql})
     ON CONFLICT (user_id, period_key) WHERE period_key IS NOT NULL DO NOTHING`,
    grantParams(userId, grant),
  );
}

/**
 * 5321 (the tester's 200 run, 17 Oct 23:14Z): the allowance was 2.5 s of a
 * 3.6 s accept — four trips one after another. The grant and the balance are
 * one statement now. The SELECT does not see the row its own INSERT writes
 * (one snapshot), so the granted amount is added to the sum explicitly — the
 * balance is exactly what the old grant-then-read gave.
 */
async function grantedBalance(userId: string, subscription: Subscription): Promise<number> {
  const grant = await dueGrant(subscription);
  if (grant === null) return getBalance(userId);
  const result = await query<{ balance: string | null }>(
    `WITH granted AS (
       INSERT INTO token_transactions (user_id, amount, reason, period_key)
       VALUES ($1, $2, $3, ${grant.keySql})
       ON CONFLICT (user_id, period_key) WHERE period_key IS NOT NULL DO NOTHING
       RETURNING amount
     )
     SELECT COALESCE((SELECT SUM(amount) FROM token_transactions WHERE user_id = $1), 0)
          + COALESCE((SELECT SUM(amount) FROM granted), 0) AS balance`,
    grantParams(userId, grant),
  );
  return Number(result.rows[0]?.balance ?? 0);
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
  if (!(await walletEnabledRecently())) {
    return { allowed: true, balance: null };
  }

  // Run 9 (16 Oct): every trip here is ~150 ms, and 0.5-1 s under 200 at
  // once. The subscription is only read, so it is read beside the expiry
  // rather than after it; the grant still follows the expiry, which reads the
  // balance the grant would change.
  const [, subscription] = await Promise.all([expireStaleGrants(userId), subscriptionOf(userId)]);
  const balance = await grantedBalance(userId, subscription);
  return { allowed: balance > 0, balance };
}

/**
 * What a settled run did to the wallet.
 *
 * `charged` is what the person paid and `absorbed` is what the house paid
 * instead of letting the balance go below zero. They are separate numbers
 * because they are separate facts, and a single „cost" would have to be one of
 * them — which is the shape of every reporting fault in this file's history.
 */
export interface RunDebit {
  readonly charged: number;
  readonly absorbed: number;
}

const NOTHING_DEBITED: RunDebit = { charged: 0, absorbed: 0 };

/**
 * ⚠️ ROW 271 (B) — THE WALLET COULD GO BELOW ZERO, AND TWICE AT ONCE.
 *
 * Misho, 25 September: „so that it can NOT exceed the token count under any
 * circumstance." What follows is that sentence made true.
 *
 * THE TWO LEAKS, BOTH MEASURED RATHER THAN REASONED ABOUT:
 *
 *   * A RUN'S COST IS NOT BOUNDED BY WHAT IS LEFT. `checkRunAllowance` asks
 *     `balance > 0` when the run STARTS; this function charges the whole
 *     actual cost when it ENDS. Seat 171873, 21 September: 15 left, one
 *     question cost 31, balance -16.
 *   * TWO RUNS COULD BOTH BE TOLD YES. Nothing was reserved in between, so two
 *     messages a few seconds apart each saw the same positive balance and each
 *     charged in full. Seat 171874, 25 September: 17 -> -6 -> -35. The
 *     founder's D348 allows ONE crossing — „at zero the person's next message
 *     is still accepted and answered once". Two at once nobody decided.
 *
 * SO THE CHARGE IS FLOORED AT THE BALANCE, UNDER A LOCK. The read of the
 * balance and the write of the debit are one transaction over a locked "User"
 * row, which is what makes the second leak impossible rather than unlikely: a
 * SELECT followed by an INSERT would hand out the same tokens twice under
 * exactly the load that makes somebody run out.
 *
 * ⚠️ AND THE COST DOES NOT VANISH WHEN THE CHARGE IS CAPPED. Somebody pays it,
 * and from today that somebody is the house, so it is WRITTEN DOWN — in
 * `absorbed`, beside the charge, not left to be inferred from two tables later.
 * Measured over 30 days before building: 394 tokens in all, 26 of them for
 * real people. `usage_events` is untouched either way; the business's own books
 * still hold what the provider charged us.
 *
 * DELIBERATELY NOT A RESERVATION AND NOT A MID-RUN STOP. A reservation only
 * moves the guess earlier — the true cost is known when the run ends and not
 * before — and stopping a run mid-sentence would cut somebody's answer in half
 * to save a fraction of a cent. The floor costs the house a measured twenty-six
 * cents a month and changes nothing a person sees.
 *
 * D348 SURVIVES INTACT, and it is worth saying which part does the surviving:
 * the grace is a rule about the NEXT message, granted by `takeGraceAnswer` when
 * the allowance is refused. The floor does not refuse anything and does not
 * touch that stamp. What changes is only the depth of the hole the crossing run
 * leaves — zero instead of minus thirty-five.
 */
export async function debitRun(userId: string, runId: string): Promise<RunDebit> {
  if (!(await isWalletEnabled())) return NOTHING_DEBITED;

  const [costResult, usdPerToken, overheadPct] = await Promise.all([
    query<{ total: string | null }>(
      'SELECT SUM(cost_usd) AS total FROM usage_events WHERE run_id = $1',
      [runId],
    ),
    getPrice('tokens.usd_per_token'),
    getPrice('infra.overhead_pct'),
  ]);

  const costUsd = Number(costResult.rows[0]?.total ?? 0);
  if (costUsd <= 0 || usdPerToken <= 0) return NOTHING_DEBITED;

  const tokens = Math.ceil((costUsd * (1 + overheadPct / PERCENT)) / usdPerToken);
  if (tokens <= 0) return NOTHING_DEBITED;

  return settleRunAgainstTheBalance(userId, runId, tokens);
}

/**
 * The locked half: read the balance and write the debit as one atomic act.
 *
 * The prices and the run's cost are read OUTSIDE this, because the lock is
 * held for as long as the transaction is and nothing in here needs to wait on
 * a price lookup.
 */
async function settleRunAgainstTheBalance(
  userId: string,
  runId: string,
  tokens: number,
): Promise<RunDebit> {
  return withTransaction(async (client) => {
    // One row, this user's. Two settles for the SAME person queue; two for
    // different people do not wait on each other at all.
    // The same lock, spelled the same way, as the referral spend a few files
    // over — two places that serialise one person's wallet should look alike.
    await client.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [userId]);

    const balanceResult = await client.query<{ balance: string | null }>(
      'SELECT SUM(amount) AS balance FROM token_transactions WHERE user_id = $1',
      [userId],
    );
    const balance = Number(balanceResult.rows[0]?.balance ?? 0);

    // An already-negative balance (there are eight of them today, from before
    // this floor existed) charges nothing rather than digging further.
    const charged = Math.min(tokens, Math.max(0, balance));
    const absorbed = tokens - charged;
    // `-0` is what negating a zero charge produces, and it reads as a minus
    // sign in every log line and test failure it ever appears in.
    const amount = charged > 0 ? -charged : 0;

    // One debit per run (Task 25 (e), migration 126): a retried settle is a
    // no-op, never a second charge. Zero rows written = nothing debited now.
    const result = await client.query(
      `INSERT INTO token_transactions (user_id, amount, reason, run_id, absorbed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (run_id) WHERE reason = 'chat_debit' AND run_id IS NOT NULL DO NOTHING`,
      [userId, amount, CHAT_DEBIT_REASON, runId, absorbed],
    );
    if ((result.rowCount ?? 0) === 0) return NOTHING_DEBITED;

    if (absorbed > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[wallet] run ${runId}: cost ${tokens}, charged ${charged}, absorbed ${absorbed} — ` +
          `balance was ${balance} and the floor held`,
      );
    }
    return { charged, absorbed };
  });
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

/** One active package by its own id (the Stripe checkout names packages this way). */
export async function findTopupPackageById(packageId: number): Promise<TopupPackage | null> {
  const packages = await listTopupPackages();
  return packages.find((pkg) => pkg.id === packageId) ?? null;
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

/**
 * §19 — an admin grant to a FICTIONAL test account, and its own reversal.
 *
 * Deliberately not `creditTopup`, for two reasons that are the whole design:
 *
 *   * `creditTopup` writes `reason = 'topup'`, and a grant must never be
 *     indistinguishable from a purchase in the ledger.
 *   * It refuses anything ≤ 0, which would leave this operation with no undo.
 *     Here the amount is SIGNED, so reversing a grant is the same call with
 *     the number negated — an ordinary row beside the first one, visible, and
 *     the balance is the sum of the column. An undo that leaves a trail.
 *
 * The caller checks that the account is a fictional seat; this function does the
 * arithmetic and nothing else. The bound is here as well as at the route
 * because a cap enforced in one place is a cap until somebody adds a second
 * caller.
 */
export const MAX_ADMIN_TOKEN_ADJUSTMENT = 50_000;
const ADMIN_ADJUST_REASON = 'admin_adjust';

export class TokenAdjustmentOutOfRange extends Error {
  constructor(tokens: number) {
    super(
      `${tokens} is outside ±${MAX_ADMIN_TOKEN_ADJUSTMENT}, or is zero. A test seat ` +
        'spends in the tens; the bound is here so an extra digit is a refusal.',
    );
    this.name = 'TokenAdjustmentOutOfRange';
  }
}

export async function adjustTestAccountTokens(
  userId: string,
  tokens: number,
  note: string,
  externalId: string,
): Promise<number> {
  const amount = Math.trunc(tokens);
  if (amount === 0 || Math.abs(amount) > MAX_ADMIN_TOKEN_ADJUSTMENT) {
    throw new TokenAdjustmentOutOfRange(amount);
  }
  await query(
    `INSERT INTO token_transactions (user_id, amount, reason, external_id, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING`,
    [userId, amount, ADMIN_ADJUST_REASON, externalId, note],
  );
  return getBalance(userId);
}

/**
 * Row 221 — D348 item 2, and the ruling is precise about which message.
 *
 * The founder, 20 September: at zero the person's next message is still
 * ACCEPTED AND ANSWERED ONCE, and the top-up wall comes after that answer
 * rather than instead of it. Not a reserve, not a change to who pays — one
 * sentence through, then the wall.
 *
 * What happened instead, measured by the seat on 21 September with no parallel
 * runs: seat 171873 walked 30 -> 15 in single questions, one more question
 * took it 15 -> -16 in a single run, and the next message got a 402 in 0.3
 * seconds with no answer at all.
 *
 * TWO THINGS THAT MEASUREMENT SETTLES, both of them in the code below:
 *
 *   * „AT ZERO" IS „BELOW ZERO" for almost everyone. A run's cost is not
 *     bounded by what is left, so the crossing run lands negative. The grace
 *     cannot test `balance === 0`; it fires whenever the allowance is refused.
 *   * THE CROSSING RUN IS NOT THE ONCE. It was paid for when it started. The
 *     ruling is about the message AFTER the balance is gone, which is exactly
 *     the message this function is asked about.
 *
 * ATOMIC ON PURPOSE. The claim and the check are one UPDATE, so two messages
 * arriving together cannot both be told they are the one — a `SELECT` then an
 * `UPDATE` would hand out the grace twice under exactly the load that makes
 * somebody run out.
 *
 * It renews with the window rather than by hand: a stamp older than the
 * current window's start is not this window's grace.
 */
export async function takeGraceAnswer(userId: string): Promise<boolean> {
  const window = budgetWindow();
  const result = await query<{ id: number }>(
    `UPDATE "User"
     SET grace_answer_used_at = NOW()
     WHERE id = $1
       AND (grace_answer_used_at IS NULL OR grace_answer_used_at < ${window.windowStartSql})
     RETURNING id`,
    [userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** What an active plan adds every window; 0 for a trial, a lapsed plan or no plan. */
async function allowancePerPeriod(userId: string): Promise<number> {
  const { status, tier } = await subscriptionOf(userId);
  return status === 'active' ? periodGrantFor(tier) : 0;
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
  const [newest, allowance] = await Promise.all([lastTopUp(userId), allowancePerPeriod(userId)]);
  return {
    enabled,
    balance: Number(row?.balance ?? 0),
    grantedThisPeriod: Number(row?.granted ?? 0),
    spentThisPeriod: Number(row?.spent ?? 0),
    window: window.label,
    resetsAt: Number.isNaN(resets.getTime()) ? '' : resets.toISOString(),
    lastTopUp: newest,
    allowancePerPeriod: allowance,
  };
}
