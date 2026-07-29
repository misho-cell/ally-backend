import { query } from '../../db/postgres/client';
import { phoneDigits } from '../phone';

const MEMBER_TIMEOUT_MS = 8_000;

/**
 * Of the given contact phones, the set (digits-canonical) that belong to a
 * registered, non-deleted Ally user. Lets a search result or profile carry an
 * `is_member` flag so the assistant steers activate-vs-invite correctly.
 *
 * The compare is format-independent ON BOTH SIDES: `"UserPhone".phone` was
 * written unnormalized for years ("+995 599 …", "995599…"), and an exact
 * string match read genuine members as non-members — the "member in one
 * request, non-member three minutes later" defect. Backed by the expression
 * index idx_user_phone_digits (migration 047).
 */
export async function fetchMembersForPhones(phones: string[]): Promise<Set<string>> {
  const digits = [...new Set(phones.map(phoneDigits))].filter(Boolean);
  if (digits.length === 0) return new Set<string>();
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT up.phone
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = ANY($1) AND u."deletedAt" IS NULL`,
    [digits],
    MEMBER_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => phoneDigits(r.phone)));
}

/** Whether one phone is an Ally member, given a set from fetchMembersForPhones. */
export function isMemberPhone(members: Set<string>, phone: string): boolean {
  return members.has(phoneDigits(phone));
}
