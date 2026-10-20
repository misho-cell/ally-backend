import { query } from '../db/postgres/client';

/**
 * 5347 (the tester's 63264 A): a five-link chain was shown by the people's
 * account names — fictional seat names — although each link had saved the next
 * under a name of their own. A chain is read the way it was built: the owner's
 * label for the first link, then the label each link saved the next one under.
 * Null where that person saved no usable label; the caller falls back.
 */
const LABEL_QUERY_TIMEOUT_MS = 5_000;

export async function labelsAlongChain(
  ownerId: number,
  phones: readonly string[],
): Promise<(string | null)[]> {
  if (phones.length === 0) return [];
  const result = await query<{ ord: number; label: string | null }>(
    `SELECT c.ord::int AS ord,
            (SELECT NULLIF(TRIM(ua.alias), '')
               FROM "UserAlias" ua
              WHERE ua.phone = c.phone
                AND ua."contactId" = CASE
                      WHEN c.ord = 1 THEN $1::int
                      ELSE (SELECT up."userId" FROM "UserPhone" up
                             WHERE up.phone = ($2::text[])[c.ord - 1] LIMIT 1)
                    END
                AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
              ORDER BY ua.id DESC
              LIMIT 1) AS label
       FROM unnest($2::text[]) WITH ORDINALITY AS c(phone, ord)`,
    [ownerId, [...phones]],
    LABEL_QUERY_TIMEOUT_MS,
  );
  const byOrder = new Map(result.rows.map((row) => [Number(row.ord), row.label]));
  return phones.map((_, index) => byOrder.get(index + 1) ?? null);
}

/**
 * #6899 (tester 21:24Z, privacy): somebody not on Netai at the end of a chain
 * is named by the label the chain's last link saved — the one who holds them —
 * never by a label some other account saved for the same number.
 */
export async function labelAtChainEnd(
  ownerId: number,
  bridges: readonly string[],
  targetPhone: string,
): Promise<string | null> {
  const labels = await labelsAlongChain(ownerId, [...bridges, targetPhone]);
  return labels[labels.length - 1] ?? null;
}
