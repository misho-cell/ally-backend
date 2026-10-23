import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { getCompositeKeysForUsers } from './neo4j.keys';

/**
 * #7162 (D868, the founder, 22 Oct): a member's ties come from EVERY
 * phonebook that holds their number, not only from their own upload. 12 of the
 * 20 launch joiners uploaded nothing, so every search started from them found
 * no one — although each was invited by somebody who has them saved (D808).
 *
 * A REVERSE TIE is written for each such holder: the member gets the holder as
 * a contact of their own, in Postgres and in the graph, so the existing search,
 * warm path and second-degree code reach them unchanged, as asker and as
 * bridge. The member's own upload of the same number wins: its name replaces
 * the holder's, and the reverse row goes.
 *
 * Off until Misho switches `reverse_ties` on: it changes whose names a member's
 * search can see.
 */
export const REVERSE_TIES_FLAG = 'reverse_ties';
export const REVERSE_TIE_SOURCE = 'reverse_tie';

const TIE_QUERY_TIMEOUT_MS = 8_000;
/** A member saved in more phonebooks than this is a public figure; the first ones are enough. */
const MAX_HOLDERS = 500;

export interface Holder {
  readonly userId: number;
  readonly name: string;
  readonly phone: string;
}

export async function isReverseTiesEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [REVERSE_TIES_FLAG],
    TIE_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.enabled === true;
}

/** The members whose own phonebooks hold one of this member's numbers. */
export async function holdersOf(memberId: number): Promise<Holder[]> {
  const result = await query<{ user_id: number; name: string | null; phone: string }>(
    `SELECT DISTINCT ON (ua."contactId") ua."contactId" AS user_id, u.name, hp.phone
       FROM "UserAlias" ua
       JOIN "UserPhone" mine ON mine.phone = ua.phone AND mine."userId" = $1
       JOIN "User" u ON u.id = ua."contactId" AND u."deletedAt" IS NULL
       JOIN "UserPhone" hp ON hp."userId" = ua."contactId"
      WHERE ua."contactId" <> $1
      ORDER BY ua."contactId", hp.phone
      LIMIT $2`,
    [memberId, MAX_HOLDERS],
    TIE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    userId: Number(r.user_id),
    name: (r.name ?? '').trim(),
    phone: r.phone,
  }));
}

/** The member's own row for this number wins; a reverse row is only added where none exists. */
async function writeReverseAliases(memberId: number, holders: readonly Holder[]): Promise<number> {
  const named = holders.filter((h) => h.name !== '');
  if (named.length === 0) return 0;
  const result = await query(
    `INSERT INTO "UserAlias" (phone, "contactId", alias, source)
     SELECT h.phone, $1::int, h.name, $4::text
       FROM unnest($2::text[], $3::text[]) AS h(phone, name)
      WHERE NOT EXISTS (
        SELECT 1 FROM "UserAlias" ua WHERE ua."contactId" = $1 AND ua.phone = h.phone
      )`,
    [memberId, named.map((h) => h.phone), named.map((h) => h.name), REVERSE_TIE_SOURCE],
    TIE_QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

/** Graph edges member → holder; an edge the member's own upload made keeps its name. */
async function writeReverseEdges(memberId: number, holders: readonly Holder[]): Promise<void> {
  const keys = await getCompositeKeysForUsers([memberId, ...holders.map((h) => h.userId)]);
  const memberKey = keys.get(memberId);
  if (!memberKey) return;
  const edges = holders
    .map((h) => ({ key: keys.get(h.userId), name: h.name }))
    .filter((e): e is { key: string; name: string } => e.key !== undefined && e.name !== '');
  if (edges.length === 0) return;
  const session = getSession();
  try {
    await session.run(
      `MERGE (m:AllyNode {phoneKey: $memberKey})
       WITH m UNWIND $edges AS e
       MERGE (h:AllyNode {phoneKey: e.key})
       MERGE (m)-[r:CONTACT]->(h)
       ON CREATE SET r.name = e.name, r.reverse = true, r.updatedAt = datetime()`,
      { memberKey, edges },
    );
  } finally {
    await session.close();
  }
}

/** Ties a member to everyone who has them saved. Returns how many new ties were written. */
export async function tieMemberToHolders(memberId: number): Promise<number> {
  if (!(await isReverseTiesEnabled())) return 0;
  const holders = await holdersOf(memberId);
  if (holders.length === 0) return 0;
  const written = await writeReverseAliases(memberId, holders);
  await writeReverseEdges(memberId, holders);
  return written;
}

/** The members among numbers somebody just saved: each now has that saver as a tie too. */
export async function tieSavedMembersToSaver(
  saverId: number,
  phones: readonly string[],
): Promise<number> {
  if (phones.length === 0 || !(await isReverseTiesEnabled())) return 0;
  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT "userId" AS user_id FROM "UserPhone" WHERE phone = ANY($1::text[]) AND "userId" <> $2`,
    [[...phones], saverId],
    TIE_QUERY_TIMEOUT_MS,
  );
  let written = 0;
  for (const row of result.rows) written += await tieMemberToHolders(Number(row.user_id));
  return written;
}

export interface BackfillReport {
  readonly dry_run: boolean;
  readonly members: number;
  readonly members_with_holders: number;
  readonly ties: number;
  /** Where the next batch starts; null when this batch reached the last member. */
  readonly next_after_user_id: number | null;
}

/**
 * 23 Oct 21:06Z, the first real run: ~1,000 members in one call outlived the
 * proxy, and the deploy that followed cut it at 3,344 ties; the re-run started
 * from the first member again. A batch is a slice of members by id, so a run is
 * driven call by call and a restart costs one batch.
 */
export const MAX_BACKFILL_BATCH = 50;

/** Members of the app (a thread of their own), the ones a reverse tie can help. */
async function appMembers(afterUserId: number, limit: number): Promise<number[]> {
  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT user_id FROM threads
      WHERE user_id IS NOT NULL AND user_id > $1
      ORDER BY user_id
      LIMIT $2`,
    [afterUserId, limit],
    TIE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => Number(r.user_id));
}

/**
 * The members who joined before reverse ties existed. A dry run counts the
 * ties it would write; a real one writes them, and only while the switch is on.
 */
export async function backfillReverseTies(
  dryRun: boolean,
  afterUserId = 0,
  batch = MAX_BACKFILL_BATCH,
): Promise<BackfillReport> {
  const members = await appMembers(afterUserId, batch);
  let withHolders = 0;
  let ties = 0;
  for (const memberId of members) {
    if (dryRun) {
      const holders = await holdersOf(memberId);
      if (holders.length > 0) withHolders += 1;
      ties += holders.length;
      continue;
    }
    const written = await tieMemberToHolders(memberId);
    if (written > 0) withHolders += 1;
    ties += written;
  }
  return {
    dry_run: dryRun,
    members: members.length,
    members_with_holders: withHolders,
    ties,
    next_after_user_id: members.length < batch ? null : (members[members.length - 1] ?? null),
  };
}
