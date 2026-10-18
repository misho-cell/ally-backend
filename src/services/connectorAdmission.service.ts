import { query } from '../db/postgres/client';
import { loginGateVerdict } from './auth.service';

const PHONE_LOOKUP_TIMEOUT_MS = 5_000;

/**
 * #5743: format-independent, as registration and the app's sign-in compare —
 * "+995 599…", "995599…" and the stored form are the same number.
 */
async function findUserIdByPhone(phone: string): Promise<number | null> {
  const result = await query<{ userId: number }>(
    `SELECT "userId" FROM "UserPhone"
      WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g') LIMIT 1`,
    [phone],
    PHONE_LOOKUP_TIMEOUT_MS,
  );
  return result.rows[0]?.userId ?? null;
}

/**
 * 5419 (founder's word, 16 Oct: strictly invite only, through every door). The
 * connector's sign-in (ChatGPT / Claude, /oauth/authorize) admitted any number
 * in "UserPhone" — the 62,000 legacy Ally accounts among them — with no
 * invitation, around the login gate the app's own sign-in asks
 * (`completeLogin`). And a thread made through the connector then makes the
 * account "belong to Netai", so the app's gate opened for it too.
 *
 * The connector now asks the same gate, through the same verdict: the account
 * whose number this is, only when the app's sign-in would admit it; else null.
 */
export async function admittedUserIdByPhone(phone: string): Promise<string | null> {
  const userId = await findUserIdByPhone(phone);
  if (userId === null) return null;
  const verdict = await loginGateVerdict(userId);
  return verdict.would_be_admitted ? String(userId) : null;
}
