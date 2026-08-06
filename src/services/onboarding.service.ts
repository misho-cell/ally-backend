// Onboarding mode detection — deterministic, per the prompt team's rule:
// onboarding ENDS at the first completed import or after the account's first
// N days, whichever comes first. Never a permanent state; the mode only
// shapes the conversation (the block's job) — a real question still gets a
// real answer.

import { query } from '../db/postgres/client';
import { intEnv } from '../config/runBudgets';

const ONBOARDING_CHECK_TIMEOUT_MS = 3_000;

/** Days after signup during which a user with no import counts as onboarding. */
export const ONBOARDING_WINDOW_DAYS = intEnv('ONBOARDING_WINDOW_DAYS', 7);

export async function isOnboardingUser(userId: string): Promise<boolean> {
  try {
    const result = await query<{ young: boolean; has_import: boolean }>(
      `SELECT (u."createdAt" > NOW() - ($2 || ' days')::interval) AS young,
              EXISTS (SELECT 1 FROM "UserAlias" WHERE "contactId" = $1) AS has_import
       FROM "User" u
       WHERE u.id = $1`,
      [userId, ONBOARDING_WINDOW_DAYS],
      ONBOARDING_CHECK_TIMEOUT_MS,
    );
    const row = result.rows[0];
    return row != null && row.young && !row.has_import;
  } catch (err) {
    // Fail-safe: a broken onboarding check must never distort a normal run —
    // the user just gets the regular quick_answer treatment.
    // eslint-disable-next-line no-console
    console.error('[onboarding] check failed — treating as regular:', (err as Error).message);
    return false;
  }
}
