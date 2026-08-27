import { query, backgroundQuery } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { getCompositeKeyForUser, getCompositeKeyForPhone } from './neo4j.keys';

const PREVIEW_TIMEOUT_MS = 10_000;
// Neo4j edge removal runs in chunks — key resolution is a lookup per phone.
const GRAPH_CHUNK_SIZE = 20;

// Ticket 7 Task 2 item 2, founder's rule D44/D23: the 1,032 contact links
// that Giorgi Turashvili's old-Ally phone sync wrote into account 501. The
// P0 retract (26 Aug) removed the FACTS those links had spawned; the links
// themselves — the phonebook rows that make those people first-degree for
// 501 — stayed. This module is the preview-then-execute pair: the preview
// is a pure read the founder sees first; the removal runs only after his
// yes, cuts the LINK and keeps the PERSON (their node, and every other
// user's rows, survive — they stay reachable as second degree through
// Giorgi's own account).
//
// Matching rule, identical to the fact retract: a 501 phonebook row is
// sync-borne when the SAME (phone, alias) byte-identical pair exists in the
// sync source's own phonebook.
//
// Removal semantics per matched row:
// - the byte-identical UserAlias row is deleted;
// - if that leaves 501 with NO alias at all for the phone (the contact
//   existed only via the sync), his UserTags rows, derived views
//   (relationship score, enrichment) and his own graph edge go too;
// - if another of his own aliases remains, the contact is genuinely his —
//   only the synced duplicate row goes and the link survives.
// Undo: none in place — restoring means a fresh import from a device that
// actually holds these contacts. That is why execution is founder-gated.

export interface ForeignSyncLink {
  phone: string;
  alias: string;
}

export interface ForeignSyncPreview {
  count: number;
  distinct_phones: number;
  links: ForeignSyncLink[];
}

/** The pure read the founder reviews — never writes anything. */
export async function previewForeignSyncLinks(
  contaminatedUserId: string,
  syncSourceUserId: string,
): Promise<ForeignSyncPreview> {
  const result = await query<ForeignSyncLink>(
    `SELECT a.phone, a.alias
     FROM "UserAlias" a
     WHERE a."contactId" = $1::int AND EXISTS (
       SELECT 1 FROM "UserAlias" b
       WHERE b."contactId" = $2::int AND b.phone = a.phone AND b.alias = a.alias
     )
     ORDER BY a.alias, a.phone`,
    [contaminatedUserId, syncSourceUserId],
    PREVIEW_TIMEOUT_MS,
  );
  const distinct = new Set(result.rows.map((r) => r.phone));
  return { count: result.rows.length, distinct_phones: distinct.size, links: result.rows };
}

export interface ForeignSyncRemovalResult {
  aliases_removed: number;
  orphaned_contacts: number;
  tags_removed: number;
  edges_removed: number;
}

/**
 * The execute half — call ONLY after the founder approved the preview.
 * Batch equivalent of removeContactFromNetwork's per-phone semantics (D23:
 * cut the link, keep the person), applied to every sync-borne row at once.
 */
export async function removeForeignSyncLinks(
  contaminatedUserId: string,
  syncSourceUserId: string,
): Promise<ForeignSyncRemovalResult> {
  const deleted = await backgroundQuery<{ phone: string }>(
    `DELETE FROM "UserAlias" a
     WHERE a."contactId" = $1::int AND EXISTS (
       SELECT 1 FROM "UserAlias" b
       WHERE b."contactId" = $2::int AND b.phone = a.phone AND b.alias = a.alias
     )
     RETURNING a.phone`,
    [contaminatedUserId, syncSourceUserId],
  );
  const touchedPhones = Array.from(new Set(deleted.rows.map((r) => r.phone)));
  if (touchedPhones.length === 0) {
    return { aliases_removed: 0, orphaned_contacts: 0, tags_removed: 0, edges_removed: 0 };
  }

  // Contacts that existed ONLY via the sync: no alias of the user's own left.
  const orphanResult = await backgroundQuery<{ phone: string }>(
    `SELECT p.phone
     FROM UNNEST($2::text[]) AS p(phone)
     WHERE NOT EXISTS (
       SELECT 1 FROM "UserAlias" ua WHERE ua."contactId" = $1::int AND ua.phone = p.phone
     )`,
    [contaminatedUserId, touchedPhones],
  );
  const orphans = orphanResult.rows.map((r) => r.phone);

  let tagsRemoved = 0;
  if (orphans.length > 0) {
    const tags = await backgroundQuery(
      `DELETE FROM "UserTags" WHERE "contactId" = $1::int AND phone = ANY($2)`,
      [contaminatedUserId, orphans],
    );
    tagsRemoved = tags.rowCount ?? 0;
    // Derived, user-scoped views — best-effort, same as the single-contact tool.
    await backgroundQuery(
      `DELETE FROM contact_relationship_scores WHERE user_id = $1::int AND contact_phone = ANY($2)`,
      [contaminatedUserId, orphans],
    ).catch(() => undefined);
    await backgroundQuery(
      `DELETE FROM contact_enrichment WHERE user_id = $1::int AND phone = ANY($2)`,
      [contaminatedUserId, orphans],
    ).catch(() => undefined);
  }

  const edgesRemoved = await removeOwnGraphEdges(contaminatedUserId, orphans);

  return {
    aliases_removed: deleted.rowCount ?? 0,
    orphaned_contacts: orphans.length,
    tags_removed: tagsRemoved,
    edges_removed: edgesRemoved,
  };
}

/**
 * The user's own CONTACT edges to the orphaned phones, removed in chunks
 * (key resolution is a per-phone lookup). Failure is logged per chunk and
 * never thrown — the Postgres rows are already gone, searches no longer show
 * these contacts; a missed edge only affects graph counts.
 */
async function removeOwnGraphEdges(userId: string, phones: string[]): Promise<number> {
  if (phones.length === 0) return 0;
  let removed = 0;
  try {
    const userKey = await getCompositeKeyForUser(Number(userId));
    for (let i = 0; i < phones.length; i += GRAPH_CHUNK_SIZE) {
      const chunk = phones.slice(i, i + GRAPH_CHUNK_SIZE);
      try {
        const keys = (
          await Promise.all(chunk.map((p) => getCompositeKeyForPhone(p).catch(() => null)))
        ).filter((k): k is string => k !== null);
        if (keys.length === 0) continue;
        const session = getSession();
        try {
          const result = await session.run(
            `MATCH (u:AllyNode {phoneKey: $userKey})-[r:CONTACT]->(c:AllyNode)
             WHERE c.phoneKey IN $keys
             DELETE r`,
            { userKey, keys },
          );
          removed += result.summary.counters.updates().relationshipsDeleted;
        } finally {
          await session.close();
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[foreign-sync] graph chunk ${i}-${i + GRAPH_CHUNK_SIZE} failed:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[foreign-sync] graph edge removal skipped:', (err as Error).message);
  }
  return removed;
}
