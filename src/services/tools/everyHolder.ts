import { query } from '../../db/postgres/client';
import { notAnExcludedHolder } from '../excludedHolders.service';

/**
 * Tester 75991 (prompt loop round 2, „two friends who both hold the target"):
 * a second-circle row listed only the friends whose OWN label matched the
 * word asked. The owner's two friends both have the electrician saved, one as
 * „ელექტრიკოსი" and one as „electrician"; a Georgian search found him through
 * the first and never said the second holds him too, so the plan named one
 * route of two. Once a person is found, every one of the owner's friends who
 * holds that number is a route, whatever they wrote on it.
 */

const HOLDERS_TIMEOUT_MS = 5_000;
/** The page is a few rows, each held by a handful of friends; a bound, not a cut. */
const MAX_HOLDER_ROWS = 400;

export interface Holder {
  readonly name: string | null;
  readonly phone: string;
  readonly user_id?: number;
  readonly saved_as: string | null;
}

interface HolderRow extends Holder {
  readonly target: string;
}

/** target phone → the owner's friends who hold it (by their own label or none), owner's name for each. */
export async function holdersOf(
  userId: string,
  friendPhones: readonly string[],
  targetPhones: readonly string[],
): Promise<Map<string, Holder[]>> {
  const out = new Map<string, Holder[]>();
  if (friendPhones.length === 0 || targetPhones.length === 0) return out;
  const result = await query<HolderRow>(
    `SELECT ua.phone AS target, up."userId" AS user_id, up.phone,
            COALESCE(own.alias, u.name) AS name, NULLIF(TRIM(ua.alias), '') AS saved_as
       FROM "UserAlias" ua
       JOIN "UserPhone" up ON up."userId" = ua."contactId"
       JOIN "User" u ON u.id = up."userId"
       LEFT JOIN LATERAL (
         SELECT o.alias FROM "UserAlias" o
          WHERE o.phone = up.phone AND o."contactId" = $1::int
            AND NULLIF(TRIM(o.alias), '') IS NOT NULL
          ORDER BY o.id DESC LIMIT 1
       ) own ON TRUE
      WHERE ua.phone = ANY($3::text[]) AND up.phone = ANY($2::text[])
        AND ${notAnExcludedHolder('up."userId"')}
      LIMIT $4`,
    [userId, [...friendPhones], [...targetPhones], MAX_HOLDER_ROWS],
    HOLDERS_TIMEOUT_MS,
  );
  for (const r of result.rows) {
    const list = out.get(r.target) ?? [];
    list.push({ name: r.name, phone: r.phone, user_id: r.user_id, saved_as: r.saved_as });
    out.set(r.target, list);
  }
  return out;
}

/**
 * Each row's bridges with every other holder after them: the ones the word
 * matched keep their place first, the rest follow; the caller's one-row-per-
 * bridge pass removes the repeats. A failed read leaves the rows as they were.
 */
export async function withEveryHolder<
  T extends { readonly phone: string; readonly via_contacts: readonly Holder[] | null },
>(userId: string, friendPhones: readonly string[], rows: readonly T[]): Promise<T[]> {
  try {
    const holders = await holdersOf(
      userId,
      friendPhones,
      rows.map((r) => r.phone),
    );
    return rows.map((r) => ({
      ...r,
      via_contacts: [...(r.via_contacts ?? []), ...(holders.get(r.phone) ?? [])],
    }));
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[second-degree] other holders unavailable:', (err as Error).message);
    return [...rows];
  }
}
