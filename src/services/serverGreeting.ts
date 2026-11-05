import { query } from '../db/postgres/client';

/**
 * The owner's registered name, read for a reply that addresses them.
 *
 * This module used to answer a bare greeting on its own (the tester's 1114,
 * D617), picked out by a greeting word list; #8779 group 4 (the founder,
 * 4 Nov) removed that — a hello goes to the model like any other line.
 */
const NAME_TIMEOUT_MS = 3_000;

/** The registered name; null when it cannot be read, so the reply goes without it. */
export async function registeredName(userId: string): Promise<string | null> {
  try {
    const result = await query<{ name: string | null }>(
      'SELECT name FROM "User" WHERE id = $1 LIMIT 1',
      [userId],
      NAME_TIMEOUT_MS,
    );
    return result.rows[0]?.name ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[greeting] could not read the name of ${userId}:`, (err as Error).message);
    return null;
  }
}
