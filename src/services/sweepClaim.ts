import { query } from '../db/postgres/client';

/**
 * WHETHER A SWEEP IS DUE — decided by the DATABASE, not by how long this
 * process has been running.
 *
 * ⚠️ WHY THIS EXISTS. The hourly sweeps hung off one `setInterval` started at
 * boot, and a deploy replaces the container. On 26 September the longest gap
 * between deploys all afternoon was twenty-five minutes, so the hour never
 * elapsed and NONE of them ran: nobody waiting on an ask was reminded, no goal
 * widened after a silent day, no method change fired.
 *
 * The symptom was absence — no error, no row, nothing to see — and it scales
 * with how hard we are working, which is the worst shape a scheduled job can
 * take. It surfaced only because a tester read „the product did nothing" when
 * the truth was that nothing had looked.
 *
 * ⚠️ AND THE CLAIM IS ATOMIC ON PURPOSE. During a deploy the old container and
 * the new one overlap, so two processes can ask at the same moment. The UPDATE
 * carries its own condition and RETURNING says who won — the loser gets false
 * and does nothing. Checking-then-running in two statements would let both
 * pass the check and both run, which for `sendDueAskReminders` means somebody
 * gets the same reminder twice.
 */
export async function claimSweep(name: string, everyMinutes: number): Promise<boolean> {
  try {
    const claimed = await query<{ name: string }>(
      `UPDATE sweep_runs
          SET last_run_at = NOW()
        WHERE name = $1
          AND last_run_at < NOW() - ($2 || ' minutes')::interval
        RETURNING name`,
      [name, everyMinutes],
      CLAIM_TIMEOUT_MS,
    );
    return claimed.rows.length > 0;
  } catch (err) {
    /**
     * ⚠️ FALSE ON FAILURE, and the direction matters. A database hiccup must
     * not become a reason to run a sweep that may have run a minute ago —
     * a duplicated reminder reaches a person, while a skipped one is picked up
     * by the next tick a few minutes later.
     */
    // eslint-disable-next-line no-console
    console.error(`[sweep] could not claim ${name}:`, (err as Error).message);
    return false;
  }
}

const CLAIM_TIMEOUT_MS = 8_000;

/** The names, written once so a caller cannot invent a slot by mistyping one. */
export const SWEEP_ASK_REMINDERS = 'ask_reminders';
export const SWEEP_SILENT_GOALS = 'silent_goals';
export const SWEEP_METHOD_CHANGES = 'method_changes';
