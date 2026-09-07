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
};

/** The window in force — read on every call so the switch needs no restart. */
export function budgetWindow(): BudgetWindow {
  return process.env.BUDGET_WINDOW?.trim().toLowerCase() === 'week' ? WEEK : MONTH;
}
