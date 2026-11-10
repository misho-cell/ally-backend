import { query } from '../db/postgres/client';

/**
 * Misho, 10 Nov („ჩვენს მხარეს ხარჯები მინიმუმზე დაიყვანე, მაქსიმუმ $50"):
 * in one day about $320 of Claude went on scheduled checks of test seats'
 * goals — about 2,200 seats left open by the 1–2 Nov batteries, each woken
 * every day with nobody there. A test seat's goal is checked on its own only
 * while someone is testing it (a typed message in its conversation within the
 * day), and never once the test seats have spent the day's budget. Held goals
 * move a day on; a tester's own message still runs as before, and answers
 * from others still reach the goal.
 */
export const TEST_SEAT_IDLE_HOURS = 24;
export const TEST_SEAT_DAILY_BUDGET_USD = 50;
const BUDGET_CACHE_MS = 5 * 60_000;
const BUDGET_QUERY_TIMEOUT_MS = 5_000;
const HOLD_QUERY_TIMEOUT_MS = 20_000;

interface BudgetReading {
  readonly at: number;
  readonly over: boolean;
}

let lastReading: BudgetReading | null = null;

/** Have the test seats spent today's (UTC) budget? Read at most every five minutes. */
export async function testSeatsOverBudget(now: number = Date.now()): Promise<boolean> {
  if (lastReading !== null && now - lastReading.at < BUDGET_CACHE_MS) return lastReading.over;
  const result = await query<{ usd: string | null }>(
    `SELECT SUM(cost_usd)::text AS usd FROM usage_events
      WHERE created_at >= date_trunc('day', NOW())
        AND user_id IN (SELECT user_id::text FROM test_seats)`,
    [],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  const spent = Number(result.rows[0]?.usd ?? 0);
  lastReading = { at: now, over: spent >= TEST_SEAT_DAILY_BUDGET_USD };
  return lastReading.over;
}

/** For tests: forget the cached budget reading. */
export function forgetBudgetReading(): void {
  lastReading = null;
}

/**
 * Every other run the server starts on its own for a goal (a day-old question,
 * a silent day, an answer arriving) asks here first: a test seat nobody is
 * testing, or past the day's budget, is not run. Real owners are never held.
 */
export async function testSeatWakeHeld(ownerId: string, threadId: number): Promise<boolean> {
  const result = await query<{ seat: boolean; recent: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM test_seats WHERE user_id::text = $1) AS seat,
            EXISTS (SELECT 1 FROM conversations c
                     WHERE c.thread_id = $2 AND c.role = 'user' AND c.kind = 'message'
                       AND c.content <> ''
                       AND c.created_at > NOW() - make_interval(hours => $3)) AS recent`,
    [ownerId, threadId, TEST_SEAT_IDLE_HOURS],
    BUDGET_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row?.seat !== true) return false;
  return !row.recent || (await testSeatsOverBudget());
}

/**
 * Moves the due wakes of test seats' goals a day on — all of them when the
 * budget is spent, else those whose conversation had no typed message within
 * the day. Returns how many were held.
 */
export async function holdTestSeatWakes(overBudget: boolean): Promise<number> {
  const result = await query(
    `UPDATE tasks t SET next_wake_at = NOW() + make_interval(hours => $1)
      WHERE t.status = 'open' AND t.next_wake_at IS NOT NULL AND t.next_wake_at <= NOW()
        AND t.user_id IN (SELECT user_id::text FROM test_seats)
        AND ($2::boolean OR NOT EXISTS (
              SELECT 1 FROM conversations c
               WHERE c.thread_id = t.thread_id AND c.role = 'user' AND c.kind = 'message'
                 AND c.content <> ''
                 AND c.created_at > NOW() - make_interval(hours => $1)))`,
    [TEST_SEAT_IDLE_HOURS, overBudget],
    HOLD_QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}
