import { query } from '../db/postgres/client';

/**
 * Misho, 3 Nov (his „ა"): for prompt debugging, the model's reasoning summary
 * is asked for on test seats only, never on a real person's runs. Thinking
 * runs and is billed the same either way; `display: "summarized"` only makes
 * a readable summary come back instead of an empty block. It is stored with
 * the run's other blocks and read by the run trace (runTrace.service.ts).
 */
export const SUMMARIZED_THINKING = { type: 'adaptive', display: 'summarized' } as const;

const SEAT_TIMEOUT_MS = 2_000;
/** Seats are few and never stop being seats; the answer is kept per process. */
const MAX_REMEMBERED = 5_000;
const remembered = new Map<string, Promise<boolean>>();

async function readIsTestSeat(userId: string): Promise<boolean> {
  try {
    const result = await query<{ user_id: number }>(
      'SELECT user_id FROM test_seats WHERE user_id = $1::int LIMIT 1',
      [userId],
      SEAT_TIMEOUT_MS,
    );
    return result.rows.length > 0;
  } catch (err) {
    // Fails towards a real person: no reasoning summary is asked for.
    // eslint-disable-next-line no-console
    console.warn(`[reasoning] seat check for ${userId} failed:`, (err as Error).message);
    remembered.delete(userId);
    return false;
  }
}

/** Should this owner's runs ask the model for a readable reasoning summary? */
export function asksForReasoningSummary(userId: string): Promise<boolean> {
  const known = remembered.get(userId);
  if (known !== undefined) return known;
  if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  const answer = readIsTestSeat(userId);
  remembered.set(userId, answer);
  return answer;
}
