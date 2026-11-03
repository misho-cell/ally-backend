import { query } from '../db/postgres/client';

/**
 * Misho, 3 Nov: for prompt debugging the chat model is asked for a readable
 * summary of its reasoning, and the exact prompt each round sent is kept —
 * first on test seats only („ა"), then the same day „რეალურ მომხმარებლებზე
 * გააკეთე ჯერ … სატესტო მომხმარებლები არ გინდა ჯერ": real people's runs only,
 * not the test seats, for now. Adaptive thinking runs and is billed the same
 * either way; `display: "summarized"` only makes a readable summary come back
 * instead of an empty block. Both are read by the run trace.
 */
export const SUMMARIZED_THINKING = { type: 'adaptive', display: 'summarized' } as const;

const SEAT_TIMEOUT_MS = 2_000;
/** Seats never stop being seats; the answer is kept per process. */
const MAX_REMEMBERED = 5_000;
const remembered = new Map<string, Promise<boolean>>();

async function readIsRealPerson(userId: string): Promise<boolean> {
  try {
    const result = await query<{ user_id: number }>(
      'SELECT user_id FROM test_seats WHERE user_id = $1::int LIMIT 1',
      [userId],
      SEAT_TIMEOUT_MS,
    );
    return result.rows.length === 0;
  } catch (err) {
    // Fails towards the run as it was: no summary asked for, no prompt kept.
    // eslint-disable-next-line no-console
    console.warn(`[reasoning] seat check for ${userId} failed:`, (err as Error).message);
    remembered.delete(userId);
    return false;
  }
}

/** Is this run debugged in full (a real person's, not a test seat's)? */
export function tracedInFull(userId: string): Promise<boolean> {
  const known = remembered.get(userId);
  if (known !== undefined) return known;
  if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  const answer = readIsRealPerson(userId);
  remembered.set(userId, answer);
  return answer;
}
