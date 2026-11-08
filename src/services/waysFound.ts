import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';

/**
 * Misho's yes, 8 Nov (ops' daily check, item 2): a day-one run tried to add two
 * go-betweens its goal had found the day before, through a mutual contact's
 * chain, and the plan was refused — the guard remembered only what the current
 * run found. The ways a search showed are now kept per conversation for a
 * while, so a person found in an earlier run of the same goal counts as found.
 * Both reads and writes fail open: a failure only means the guard knows less.
 */
const WAYS_TIMEOUT_MS = 3_000;
const WAYS_KEPT_DAYS = 30;
const MAX_WAYS_PER_WRITE = 200;
const MAX_WAYS_READ = 500;

/** Keeps the phones a search showed as ways in, for this conversation. */
export async function rememberWaysFound(
  threadId: number,
  phones: readonly string[],
): Promise<void> {
  const digits = [...new Set(phones.map(phoneDigits).filter((d) => d !== ''))].slice(
    0,
    MAX_WAYS_PER_WRITE,
  );
  if (digits.length === 0) return;
  try {
    await query(
      `INSERT INTO thread_ways_found (thread_id, phone_digits)
       SELECT $1, d FROM unnest($2::text[]) AS d
       ON CONFLICT (thread_id, phone_digits) DO UPDATE SET found_at = NOW()`,
      [threadId, digits],
      WAYS_TIMEOUT_MS,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ways-found] thread ${threadId}: not kept:`, (err as Error).message);
  }
}

/** The ways earlier runs in this conversation found, within the last WAYS_KEPT_DAYS days. */
export async function waysFoundBefore(threadId: number): Promise<Set<string>> {
  try {
    const result = await query<{ phone_digits: string }>(
      `SELECT phone_digits FROM thread_ways_found
        WHERE thread_id = $1 AND found_at > NOW() - make_interval(days => $2)
        ORDER BY found_at DESC
        LIMIT $3`,
      [threadId, WAYS_KEPT_DAYS, MAX_WAYS_READ],
      WAYS_TIMEOUT_MS,
    );
    return new Set(result.rows.map((r) => r.phone_digits));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ways-found] thread ${threadId}: not read:`, (err as Error).message);
    return new Set();
  }
}

/**
 * This run's ways and the conversation's earlier ones, as one set. A run that
 * searched nothing is not checked at all (as before), so the earlier ways only
 * widen what a searching run may name — never narrow anything.
 */
export function withEarlierWays(
  thisRun: ReadonlySet<string> | undefined,
  earlier: ReadonlySet<string>,
): ReadonlySet<string> | undefined {
  if (thisRun === undefined || thisRun.size === 0) return thisRun;
  return new Set([...thisRun, ...earlier]);
}
