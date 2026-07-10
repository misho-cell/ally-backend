import { query } from '../../db/postgres/client';
import { normalizePhone } from '../phone';

const MEMBER_TIMEOUT_MS = 8_000;

/**
 * Of the given contact phones, the set (normalized) that belong to a registered,
 * non-deleted Ally user. Lets a search result or profile carry an `is_member`
 * flag so the assistant steers activate-vs-invite and intro-vs-share correctly.
 */
export async function fetchMembersForPhones(phones: string[]): Promise<Set<string>> {
  const normalized = [...new Set(phones.map(normalizePhone))].filter(Boolean);
  if (normalized.length === 0) return new Set<string>();
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT up.phone
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE up.phone = ANY($1) AND u."deletedAt" IS NULL`,
    [normalized],
    MEMBER_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => normalizePhone(r.phone)));
}

/** Whether one phone is an Ally member, given a set from fetchMembersForPhones. */
export function isMemberPhone(members: Set<string>, phone: string): boolean {
  return members.has(normalizePhone(phone));
}
