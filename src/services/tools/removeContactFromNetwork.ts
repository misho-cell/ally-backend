import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { getCompositeKeyForUser, getCompositeKeyForPhone } from '../neo4j.keys';
import { recordProductEvent } from '../productEvents.service';

// D23, path (1) — founder's decision: user-initiated unlink, a NEW tool, not
// exclude_contact (an exclusion filters a person out of consideration for a
// purpose; an unlink removes them from the user's FIRST-degree view entirely,
// while they must still appear as a second-degree bridge through others).
// What goes: the user's own phonebook rows (UserAlias/UserTags), their
// derived relationship score and enrichment view, and their own graph edge.
// What stays: the user's saved notes and facts (kept in the store, detached),
// exclusions, blocks — and every OTHER user's rows, which is exactly what
// keeps the person reachable as a bridge.

const REMOVE_TIMEOUT_MS = 10_000;

export interface RemoveContactOutcome {
  removed: boolean;
  error?: string;
  aliases_removed?: number;
  tags_removed?: number;
  note?: string;
}

export async function removeContactFromNetwork(
  userId: string,
  phone: string,
): Promise<RemoveContactOutcome> {
  const trimmed = phone.trim();
  if (!trimmed) return { removed: false, error: 'Pass the phone id from a search result.' };

  const owned = await query<{ alias: string }>(
    `SELECT alias FROM "UserAlias" WHERE "contactId" = $1 AND phone = $2 LIMIT 1`,
    [userId, trimmed],
    REMOVE_TIMEOUT_MS,
  );
  if (owned.rows.length === 0) {
    return {
      removed: false,
      error: 'ეს ნომერი შენს ქსელში არ არის — ჯერ მოძებნე და შედეგიდან აიღე ნომერი.',
    };
  }

  const aliases = await query(
    `DELETE FROM "UserAlias" WHERE "contactId" = $1 AND phone = $2`,
    [userId, trimmed],
    REMOVE_TIMEOUT_MS,
  );
  const tags = await query(
    `DELETE FROM "UserTags" WHERE "contactId" = $1 AND phone = $2`,
    [userId, trimmed],
    REMOVE_TIMEOUT_MS,
  );
  // Derived, user-scoped views of the removed contact go with it. Best-effort:
  // a missing table in an environment must not fail the removal.
  await query(
    `DELETE FROM contact_relationship_scores WHERE user_id = $1 AND contact_phone = $2`,
    [userId, trimmed],
    REMOVE_TIMEOUT_MS,
  ).catch(() => undefined);
  await query(
    `DELETE FROM contact_enrichment WHERE user_id = $1 AND phone = $2`,
    [userId, trimmed],
    REMOVE_TIMEOUT_MS,
  ).catch(() => undefined);

  await removeOwnGraphEdge(userId, trimmed);

  void recordProductEvent(userId, 'contact_removed_from_network', {
    phone_last4: trimmed.slice(-4),
  });

  return {
    removed: true,
    aliases_removed: aliases.rowCount ?? 0,
    tags_removed: tags.rowCount ?? 0,
    note:
      'ამოღებულია შენი ქსელიდან: ძებნებში აღარ გამოჩნდება. შენი შენახული ჩანაწერები მასზე ' +
      'შენარჩუნებულია; სხვების ქსელებში ის ისევ არსებობს და მეორე წრეში ისევ გამოჩნდება. ' +
      'დაბრუნება მხოლოდ კონტაქტების ხელახალი იმპორტით შეიძლება.',
  };
}

/**
 * The user's OWN edge to this contact — the same single-edge shape the
 * erasure cascade removes in bulk. Failure is logged, never thrown: the
 * Postgres rows are already gone and searches no longer show the person.
 */
async function removeOwnGraphEdge(userId: string, phone: string): Promise<void> {
  try {
    const [userKey, contactKey] = await Promise.all([
      getCompositeKeyForUser(Number(userId)),
      getCompositeKeyForPhone(phone),
    ]);
    const session = getSession();
    try {
      await session.run(
        `MATCH (u:AllyNode {phoneKey: $userKey})-[r:CONTACT]->(c:AllyNode {phoneKey: $contactKey})
         DELETE r`,
        { userKey, contactKey },
      );
    } finally {
      await session.close();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[remove-contact] graph edge removal failed:', (err as Error).message);
  }
}
