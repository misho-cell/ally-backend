import { PoolClient } from 'pg';
import { withTransaction } from '../db/postgres/client';

/**
 * #7761 (founder, 25 Oct): a label „chemi" he never saved shows on Giorgi
 * Turashvili — a second card on the same number, from a phonebook upload. The
 * owner's own page can remove only labels he wrote, so an imported label that
 * is wrong is removed here, by row id, and only rows saved by this owner.
 */
const REMOVE_TIMEOUT_MS = 5_000;
/** One wrong card at a time; a bound, so a wrong list cannot empty a phonebook. */
export const MAX_LABEL_ROWS = 50;

export interface LabelRemoval {
  readonly aliases_removed: number;
  readonly tags_removed: number;
}

async function removeRows(
  client: PoolClient,
  table: 'UserAlias' | 'UserTags',
  ownerId: number,
  ids: readonly number[],
): Promise<number> {
  if (ids.length === 0) return 0;
  await client.query(`SET LOCAL statement_timeout = ${REMOVE_TIMEOUT_MS}`);
  const result = await client.query(
    `DELETE FROM "${table}" WHERE "contactId" = $1 AND id = ANY($2::int[])`,
    [ownerId, [...ids]],
  );
  return result.rowCount ?? 0;
}

export async function removeImportedLabels(
  ownerId: number,
  aliasIds: readonly number[],
  tagIds: readonly number[],
): Promise<LabelRemoval> {
  return withTransaction(async (client) => ({
    aliases_removed: await removeRows(client, 'UserAlias', ownerId, aliasIds),
    tags_removed: await removeRows(client, 'UserTags', ownerId, tagIds),
  }));
}
