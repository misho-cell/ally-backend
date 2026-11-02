import { query } from '../db/postgres/client';

const FIRST_LINE_TIMEOUT_MS = 3_000;
/** The line being answered may already be saved, so one typed line is still the first. */
const LINES_OF_A_NEW_OWNER = 1;

/**
 * #8519 (the tester's 80752 item 5, case 48): a new member's first „გამარჯობა"
 * took the small-talk shortcut and got a fixed greeting in three seconds — no
 * look at their network and no first question. A member who has never typed
 * anything before gets the full run instead. Fails towards false, which keeps
 * the shortcut.
 */
export async function isOwnersFirstLine(userId: string): Promise<boolean> {
  try {
    const result = await query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM (
         SELECT 1 FROM conversations
          WHERE user_id = $1::int AND role = 'user' AND content <> ''
          LIMIT $2
       ) earlier`,
      [userId, LINES_OF_A_NEW_OWNER + 1],
      FIRST_LINE_TIMEOUT_MS,
    );
    return Number(result.rows[0]?.n ?? LINES_OF_A_NEW_OWNER + 1) <= LINES_OF_A_NEW_OWNER;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[first-line] user ${userId}:`, (err as Error).message);
    return false;
  }
}
