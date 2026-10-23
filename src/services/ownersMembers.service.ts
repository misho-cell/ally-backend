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

/**
 * #6370 (the tester's 69142; Ninia's Axel test): the note built from this list
 * named EVERY member in the owner's book and told the run to put them in the
 * plan, whatever the subject — the same few people offered for every topic.
 * With the subject's terms, only members whose saved words (any saver's label
 * or tag, a fact, their own employer or role) hold one of them are kept.
 */
const TOPIC_POOL = 200;
const MIN_TOPIC_TERM_CHARS = 4;

async function membersOnTopic(
  phones: readonly string[],
  terms: readonly string[],
): Promise<Set<string>> {
  const patterns = terms.filter((t) => t.length >= MIN_TOPIC_TERM_CHARS).map((t) => `%${t}%`);
  if (phones.length === 0 || patterns.length === 0) return new Set();
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT p.phone FROM unnest($1::text[]) AS p(phone)
      WHERE EXISTS (SELECT 1 FROM "UserAlias" a WHERE a.phone = p.phone AND a.alias ILIKE ANY($2::text[]))
         OR EXISTS (SELECT 1 FROM "UserTags" t WHERE t.phone = p.phone AND t.tag ILIKE ANY($2::text[]))
         OR EXISTS (SELECT 1 FROM contact_facts f WHERE f.neo4j_contact_id = p.phone
                     AND f.retracted_at IS NULL AND COALESCE(f.canonical_value, f.value) ILIKE ANY($2::text[]))
         OR EXISTS (SELECT 1 FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
                     WHERE up.phone = p.phone
                       AND (u.employer ILIKE ANY($2::text[]) OR u."jobPosition" ILIKE ANY($2::text[])))`,
    [phones, patterns],
    MEMBERS_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.phone));
}

export async function ownersContactsOnNetai(
  userId: string,
  limit: number,
  subjectTerms?: readonly string[],
): Promise<string[]> {
  const onTopic = subjectTerms !== undefined;
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
      [userId, NETAI_ACTIVE_SUBSCRIPTION_STATUSES, onTopic ? TOPIC_POOL : limit],
      MEMBERS_QUERY_TIMEOUT_MS,
    ),
    getExcludedPhoneSet(userId),
  ]);
  const kept = rows.rows.filter((r) => !excluded.has(normalizePhone(r.phone)));
  const topical = onTopic
    ? await membersOnTopic(
        kept.map((r) => r.phone),
        subjectTerms,
      )
    : null;
  return kept
    .filter((r) => topical === null || topical.has(r.phone))
    .map((r) => (r.name ?? '').trim())
    .filter((name) => name !== '')
    .slice(0, limit);
}
