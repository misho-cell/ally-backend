import { query } from '../db/postgres/client';
import { getExcludedPhoneSet } from './block.service';
import { normalizePhone } from './phone';

/**
 * #960, the tester's 1145 (37787, 37895, 37878): the rule that asks a reply to
 * offer the owner's contacts on Netai only knew the ones the run's own
 * searches returned — and a run that never listed them gave it nothing to
 * remember. This reads them from the owner's phonebook: his contacts whose
 * account uses Netai, by the name HE saved them under. Names only; the number
 * never leaves this function.
 */
const MEMBERS_QUERY_TIMEOUT_MS = 3_000;
const NETAI_ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'];

export async function ownersContactsOnNetai(userId: string, limit: number): Promise<string[]> {
  const [rows, excluded] = await Promise.all([
    query<{ phone: string; name: string | null }>(
      `SELECT DISTINCT ON (u.id) up.phone, COALESCE(NULLIF(TRIM(ua.alias), ''), u.name) AS name
         FROM "UserAlias" ua
         JOIN "UserPhone" up ON up.phone = ua.phone
         JOIN "User" u ON u.id = up."userId"
        WHERE ua."contactId" = $1::int AND u.id <> $1::int AND u."deletedAt" IS NULL
          AND (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
            OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
            OR u.subscription_status = ANY($2::text[]))
        ORDER BY u.id
        LIMIT $3::int`,
      [userId, NETAI_ACTIVE_SUBSCRIPTION_STATUSES, limit],
      MEMBERS_QUERY_TIMEOUT_MS,
    ),
    getExcludedPhoneSet(userId),
  ]);
  return rows.rows
    .filter((r) => !excluded.has(normalizePhone(r.phone)))
    .map((r) => (r.name ?? '').trim())
    .filter((name) => name !== '');
}
