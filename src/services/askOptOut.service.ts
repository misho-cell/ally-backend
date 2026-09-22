import { query } from '../db/postgres/client';

// A person-level "stop writing to me" (ticket 4, item 00). Scope is deliberate
// and is the plain reading of what people actually say: NO ask from ANYONE
// reaches an opted-out person, on any task, until they lift it themselves.
// Anything narrower would have to be said out loud at the moment they ask, and
// the assistant's own wording ("I will not trouble you again") is already
// absolute — the promise the product makes is the promise it must keep.

const OPTOUT_QUERY_TIMEOUT_MS = 5_000;

export async function isOptedOutFromAsks(userId: number | string): Promise<boolean> {
  const result = await query<{ user_id: number }>(
    'SELECT user_id FROM ask_optouts WHERE user_id = $1::int LIMIT 1',
    [userId],
    OPTOUT_QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/**
 * Record the refusal AND stop everything already in flight: pending asks to
 * this person are cancelled silently — cancellation notices are messages, and
 * they just asked for no more messages.
 */
export async function optOutFromAsks(userId: string, reason?: string): Promise<void> {
  await query(
    `INSERT INTO ask_optouts (user_id, reason) VALUES ($1::int, $2)
     ON CONFLICT (user_id) DO UPDATE SET reason = COALESCE(EXCLUDED.reason, ask_optouts.reason)`,
    [userId, reason ?? null],
    OPTOUT_QUERY_TIMEOUT_MS,
  );
  await query(
    `INSERT INTO ask_optout_events (user_id, action, reason) VALUES ($1::int, 'opt_out', $2)`,
    [userId, reason ?? null],
    OPTOUT_QUERY_TIMEOUT_MS,
  );
  /**
   * The cancelling, and — new on 22 September — telling the people who asked.
   *
   * It lives in `taskAsks` because the ask domain does, and it is reached by a
   * dynamic import because that module imports THIS one: `isOptedOutFromAsks`
   * is read on every send. A static import back would be a load-order cycle.
   *
   * After the opt-out itself is recorded, and best-effort: a person must never
   * fail to be left alone because somebody else's thread could not be written
   * to. If this throws, every ask is still cancelled by the statement inside
   * it and only the telling is lost.
   */
  try {
    const { withdrawAsksToOptedOutPerson } = await import('./taskAsks.service');
    await withdrawAsksToOptedOutPerson(userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[opt-out] could not withdraw pending asks:', (err as Error).message);
  }
}

/** The way back — a stop that cannot be lifted is its own problem. */
export async function resumeAsks(userId: string): Promise<void> {
  await query('DELETE FROM ask_optouts WHERE user_id = $1::int', [userId], OPTOUT_QUERY_TIMEOUT_MS);
  await query(
    `INSERT INTO ask_optout_events (user_id, action) VALUES ($1::int, 'resume')`,
    [userId],
    OPTOUT_QUERY_TIMEOUT_MS,
  );
}
