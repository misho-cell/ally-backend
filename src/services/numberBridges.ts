import { query } from '../db/postgres/client';
import { nameAsSavedBySql } from './savedNameSql';

/**
 * 5286 (Lika №181): Netai rightly kept a second-circle person's number back,
 * but offered no introduction — the refusal named nobody to go through. The
 * owner's own contacts on Netai who have that number saved are the way in, so
 * the refusal now names them, in the owner's own spelling.
 */
const QUERY_TIMEOUT_MS = 3_000;
const MAX_BRIDGES = 3;

/** The owner's contacts on Netai who hold this phone; empty when none, or on any failure. */
export async function bridgesHolding(ownerId: string, phone: string): Promise<string[]> {
  try {
    const result = await query<{ name: string | null }>(
      `SELECT DISTINCT ON (bu.id) ${nameAsSavedBySql('$1::int', 'bu.id')} AS name
         FROM "UserAlias" mine
         JOIN "UserPhone" bp ON bp.phone = mine.phone
         JOIN "User" bu ON bu.id = bp."userId" AND bu."deletedAt" IS NULL
         JOIN "UserAlias" theirs
           ON theirs."contactId" = bu.id
          AND regexp_replace(theirs.phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
        WHERE mine."contactId" = $1::int
          AND bu.id <> $1::int
        LIMIT ${MAX_BRIDGES}`,
      [ownerId, phone],
      QUERY_TIMEOUT_MS,
    );
    return result.rows.map((row) => row.name?.trim() ?? '').filter((name) => name !== '');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[number-bridges] not read:', (err as Error).message);
    return [];
  }
}
