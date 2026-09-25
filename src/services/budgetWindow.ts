/**
 * The window every allowance is counted in (Ticket 10 Task 25 (c); D124).
 *
 * The founder's ruling of 7 September: one WEEKLY limit per account replaces
 * the monthly token grant and the monthly ask budget — reset day and hour, a
 * top-up when it runs out. The numbers are his to set with Misho; until they
 * are, nothing here changes: the default window is the calendar month, exactly
 * as before. Switching is one variable, BUDGET_WINDOW=week, and it moves the
 * token grant, the grant expiry and the ask budget together — a window that
 * moved one and not the other would be two limits again.
 *
 * Every SQL fragment below is a literal chosen from a closed set, never a
 * value interpolated from the environment — the env decides WHICH fragment,
 * not what it says.
 */

export type BudgetWindowUnit = 'month' | 'week';

export interface BudgetWindow {
  unit: BudgetWindowUnit;
  /** Prefix of the period key rows are stamped with: 'm:' or 'w:'. */
  keyPrefix: string;
  /** SQL: the current period's key, e.g. 'm:2026-09' or 'w:2026-W37'. */
  currentKeySql: string;
  /** SQL: the start of the current window. */
  windowStartSql: string;
  /** SQL: the moment the window resets. */
  windowResetSql: string;
  /**
   * SQL: the start and end of a PAST period, given as the placeholder ($2 …)
   * that carries its key without the prefix — '2026-09' or '2026-W37'.
   */
  periodStartSql: string;
  periodEndSql: string;
  /** The price key the grant is read from, before the tier suffix. */
  grantPriceKey: string;
  /** What the admin read calls the window. */
  label: 'calendar_month' | 'calendar_week';
  /**
   * WHEN THE ALLOWANCE COMES BACK, as a date rather than as a word.
   *
   * D494, the founder: „tell the user to top up OR wait for the refill, WITH
   * THE DAY." The refusal already said „wait for the monthly renewal", which
   * is a true sentence that leaves somebody with no idea whether to wait ten
   * minutes or three weeks — and waiting is one of the two things he is being
   * offered. A choice between „pay" and „wait an unknown time" is not a choice.
   *
   * Computed here rather than read back from the database, because it is the
   * same arithmetic `windowResetSql` already does and the refusal path should
   * not need a query to finish a sentence. UTC on both sides, so the two
   * cannot drift apart.
   */
  nextReset: (now: Date) => Date;
}

/** Midnight UTC on the first of the month after the one `now` is in. */
function firstOfNextMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Midnight UTC on the coming Monday. `date_trunc('week', …) + 1 week` in
 * Postgres is the Monday after the one that has started, and Sunday belongs to
 * the week that began six days earlier — which is why this is `8 - day` for
 * Sunday rather than „tomorrow".
 */
function nextMonday(now: Date): Date {
  const day = now.getUTCDay();
  const daysAhead = day === 0 ? 1 : 8 - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead));
}

/** The placeholder every period fragment reads its key from. */
export const PERIOD_KEY_PARAM = '$2';

const MONTH: BudgetWindow = {
  unit: 'month',
  keyPrefix: 'm:',
  currentKeySql: `'m:' || to_char(NOW(), 'YYYY-MM')`,
  windowStartSql: `date_trunc('month', NOW())`,
  windowResetSql: `date_trunc('month', NOW()) + INTERVAL '1 month'`,
  periodStartSql: `to_date(${PERIOD_KEY_PARAM}, 'YYYY-MM')`,
  periodEndSql: `to_date(${PERIOD_KEY_PARAM}, 'YYYY-MM') + INTERVAL '1 month'`,
  grantPriceKey: 'tokens.monthly_grant',
  label: 'calendar_month',
  nextReset: firstOfNextMonth,
};

/** ISO weeks, Monday to Sunday, so 'w:2026-W37' sorts and compares like 'm:2026-09'. */
const WEEK: BudgetWindow = {
  unit: 'week',
  keyPrefix: 'w:',
  currentKeySql: `'w:' || to_char(NOW(), 'IYYY-"W"IW')`,
  windowStartSql: `date_trunc('week', NOW())`,
  windowResetSql: `date_trunc('week', NOW()) + INTERVAL '1 week'`,
  periodStartSql: `to_date(${PERIOD_KEY_PARAM}, 'IYYY-"W"IW')`,
  periodEndSql: `to_date(${PERIOD_KEY_PARAM}, 'IYYY-"W"IW') + INTERVAL '1 week'`,
  grantPriceKey: 'tokens.weekly_grant',
  label: 'calendar_week',
  nextReset: nextMonday,
};

/** The window in force — read on every call so the switch needs no restart. */
export function budgetWindow(): BudgetWindow {
  return process.env.BUDGET_WINDOW?.trim().toLowerCase() === 'week' ? WEEK : MONTH;
}
