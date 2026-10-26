import { query } from '../db/postgres/client';
import { DEFAULT_PUSH_TIME_ZONE, isQuietHour } from './pushQuietHours';

/**
 * #7234 night 1 (tester 76165): two goals of a real owner woke at 04:04
 * Tbilisi on helpers' answers that had waited, wrote him a decision question
 * and closed one goal — the quiet-hours gate sat only on the engine's tick, so
 * every other wake path (answer delivery, sweeps' direct wakes) ran through
 * the night. The gate now sits on the wake itself.
 *
 * Not held: a wake the owner caused himself (his answer to a goal question,
 * his answer to a Netai message), an admin's manual wake, and fictional test
 * seats, which are tested at night on purpose.
 *
 * Chorus invite asks are held in their own cron (Misho's yes, 26 Oct).
 */
const SEAT_LOOKUP_TIMEOUT_MS = 3_000;

export enum WakeOrigin {
  /** Netai starts it on its own: an answer arrived, a sweep, a schedule. */
  Netai = 'netai',
  /** The owner's own action led to it, or an admin woke it by hand. */
  Owner = 'owner',
}

async function isTestSeat(userId: string): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM test_seats WHERE user_id = $1::int) AS found`,
    [userId],
    SEAT_LOOKUP_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

/** Should this wake wait for the morning? Test seats and owner-caused wakes never do. */
export async function wakeWaitsForMorning(
  ownerId: string,
  origin: WakeOrigin,
  now: Date = new Date(),
): Promise<boolean> {
  if (origin === WakeOrigin.Owner) return false;
  if (!isQuietHour(now, DEFAULT_PUSH_TIME_ZONE)) return false;
  return !(await isTestSeat(ownerId));
}

/**
 * The same question asked by a goal's id, for the answer paths: an answer that
 * arrives at night stays owed — its card and the run it starts come in the
 * morning, from the hourly sweep.
 */
export async function goalWaitsForMorning(
  taskId: number,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isQuietHour(now, DEFAULT_PUSH_TIME_ZONE)) return false;
  const result = await query<{ user_id: number }>(
    `SELECT user_id FROM tasks WHERE id = $1 LIMIT 1`,
    [taskId],
    SEAT_LOOKUP_TIMEOUT_MS,
  );
  const owner = result.rows[0];
  if (!owner) return false;
  return !(await isTestSeat(String(owner.user_id)));
}
