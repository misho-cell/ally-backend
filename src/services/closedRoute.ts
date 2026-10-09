import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';
import { PrematchWord, prematchMany } from './prematch.service';

/**
 * 1697 part 2 (A14, D679/D680): when the bridge AND the receiver are both
 * „not of this field" by their own data, a request would only wait for a no.
 * No request is made; the model hears the route looks closed and proposes
 * another way — never why (the reason is other people's data, D680).
 *
 * The line the model reads is NIGHT_QUESTIONS AO, approved by Misho on
 * 9 Oct 06:25 UTC (ADMIN_WRITE_OPERATIONS §110.1).
 */
export const CLOSED_ROUTE_ON = true;

/** NIGHT_QUESTIONS AO, the exact approved text (§110.1). */
export const CLOSED_ROUTE_LINE =
  'Not sent: this route looks closed. Say so to the owner in one plain line — never why, and nothing about these people — and propose another way.';

const QUERY_TIMEOUT_MS = 5_000;

/** Both sides say, from their own data, that this is not their field. */
export function routeLooksClosed(
  bridge: PrematchWord | undefined,
  receiver: PrematchWord | undefined,
): boolean {
  return bridge === PrematchWord.NotHisField && receiver === PrematchWord.NotHisField;
}

async function goalTitle(taskId: number): Promise<string | null> {
  const result = await query<{ title: string | null }>(
    `SELECT title FROM tasks WHERE id = $1 LIMIT 1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.title ?? null;
}

/**
 * Is this route closed for this goal? False whenever anything is unknown: no
 * goal, no receiver phone, or a failed read — a request is never stopped on
 * a guess.
 */
export async function closedRouteFor(
  taskId: number | undefined,
  bridgePhone: string,
  receiverPhone: string | undefined,
): Promise<boolean> {
  if (taskId === undefined || receiverPhone === undefined) return false;
  try {
    const goal = await goalTitle(taskId);
    if (goal === null || goal.trim() === '') return false;
    const words = await prematchMany([bridgePhone, receiverPhone], goal);
    return routeLooksClosed(
      words.get(phoneDigits(bridgePhone))?.word,
      words.get(phoneDigits(receiverPhone))?.word,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[closed-route] not read:', (err as Error).message);
    return false;
  }
}
