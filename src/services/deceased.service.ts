import { query } from '../db/postgres/client';
import { NO_CONTACT_IN_THE_CALL } from './block.service';
import { normalizePhone } from './phone';

/**
 * A MARK KEYED ON NOTHING REACHES NOBODY, AND SAYS IT WORKED.
 *
 * This is the gentlest thing the product does — it stops the assistant from
 * ever suggesting a person who has died — and it was the one write of its kind
 * that neither checked its phone nor canonicalized it. A call with no digits in
 * it stored a row under `''`, and `{ ok: true }` went back. The next run
 * suggested them again.
 *
 * The phone is stored canonical for the same reason every other table does:
 * the read (`getExcludedPhoneSet`) normalizes both sides, so an older raw row
 * still matches, and a new one no longer depends on that.
 */
export async function markContactDeceased(
  userId: string,
  phone: string,
): Promise<{ marked: boolean; error?: string }> {
  const canonical = normalizePhone(phone);
  if (!canonical) return { marked: false, error: NO_CONTACT_IN_THE_CALL };
  await query(
    `INSERT INTO "ContactDeceased" ("userId", phone, "createdAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT ("userId", phone) DO NOTHING`,
    [userId, canonical],
  );
  return { marked: true };
}

export async function getDeceasedPhones(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT phone FROM "ContactDeceased" WHERE "userId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.phone);
}
