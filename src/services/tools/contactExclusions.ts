import { query } from '../../db/postgres/client';
import { phoneDigits } from '../phone';

const EXCLUSION_TIMEOUT_MS = 5_000;
const MAX_FIELD_CHARS = 300;

export interface ContactExclusion {
  excluded_for: string;
  reason: string;
  revisit_if: string | null;
}

/**
 * Record the user's decision: this contact is not to be suggested FOR THIS
 * SCOPE, with their reason and (optionally) what would make it stale. One row
 * per (contact, scope); saving again overwrites the reason.
 */
export async function saveContactExclusion(
  userId: string,
  contactPhone: string,
  excludedFor: string,
  reason: string,
  revisitIf?: string,
): Promise<{ saved: boolean; error?: string }> {
  const scope = excludedFor.trim().slice(0, MAX_FIELD_CHARS);
  const why = reason.trim().slice(0, MAX_FIELD_CHARS);
  if (!scope || !why) return { saved: false, error: 'Pass excluded_for and reason.' };
  await query(
    `INSERT INTO contact_exclusions (user_id, contact_phone, excluded_for, reason, revisit_if)
     VALUES ($1::int, $2, $3, $4, $5)
     ON CONFLICT (user_id, contact_phone, excluded_for)
     DO UPDATE SET reason = $4, revisit_if = $5, created_at = NOW()`,
    [
      userId,
      phoneDigits(contactPhone),
      scope,
      why,
      revisitIf?.trim().slice(0, MAX_FIELD_CHARS) ?? null,
    ],
    EXCLUSION_TIMEOUT_MS,
  );
  return { saved: true };
}

/** Lift an exclusion (scope given) or all of them for the contact (scope omitted). */
export async function removeContactExclusion(
  userId: string,
  contactPhone: string,
  excludedFor?: string,
): Promise<{ removed: number }> {
  const result = await query(
    `DELETE FROM contact_exclusions
     WHERE user_id = $1::int AND contact_phone = $2
       AND ($3::text IS NULL OR excluded_for = $3)`,
    [userId, phoneDigits(contactPhone), excludedFor?.trim() || null],
    EXCLUSION_TIMEOUT_MS,
  );
  return { removed: result.rowCount ?? 0 };
}

/**
 * Exclusions for a set of result phones, keyed by digits — attached INSIDE
 * search results so the assistant never has to remember a separate lookup.
 * Best-effort: an error returns an empty map, never fails the search.
 */
export async function fetchExclusionsForPhones(
  userId: string,
  phones: string[],
): Promise<Map<string, ContactExclusion[]>> {
  const map = new Map<string, ContactExclusion[]>();
  const digits = [...new Set(phones.map(phoneDigits))].filter(Boolean);
  if (digits.length === 0) return map;
  try {
    const result = await query<ContactExclusion & { contact_phone: string }>(
      `SELECT contact_phone, excluded_for, reason, revisit_if
       FROM contact_exclusions
       WHERE user_id = $1::int AND contact_phone = ANY($2)`,
      [userId, digits],
      EXCLUSION_TIMEOUT_MS,
    );
    for (const row of result.rows) {
      const list = map.get(row.contact_phone) ?? [];
      list.push({
        excluded_for: row.excluded_for,
        reason: row.reason,
        revisit_if: row.revisit_if,
      });
      map.set(row.contact_phone, list);
    }
  } catch {
    // Search must survive an exclusions hiccup.
  }
  return map;
}
