import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/postgres/client';
import { EditOutcome } from './contactEdits.service';
import { Warmth } from './contactPage.service';
import { phoneDigits } from './phone';

/**
 * The frontend's item 3 (its 21:10Z note, Misho's yes): what the owner sets on
 * a contact's page — warmth, their own labels, and an exclusion from one goal.
 * Each is written where the assistant already reads it, so a choice made on
 * the page changes what Netai does, not only what the page shows:
 *   - warmth → the owner's hand-set tier (human_relationship_tiers);
 *   - labels → "UserTags" with source USER_CREATED, which search reads;
 *   - exclusion → contact_exclusions, now with the goal it is for.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const MAX_OWN_LABEL_CHARS = 40;
const OWN_LABEL_SOURCE = 'USER_CREATED';
const PAGE_TIER_SOURCE = 'contact_page';

export type HandTier = 'green' | 'yellow' | 'red';

/** The hand-set tier that reads back as each warmth on the page and in the searches. */
export function tierForWarmth(warmth: Warmth): HandTier {
  if (warmth === Warmth.Warm) return 'green';
  return warmth === Warmth.Distant ? 'red' : 'yellow';
}

interface TierRow {
  readonly contact_phone: string;
  readonly tier: string;
  readonly source: string;
  readonly replaced_tier: string | null;
  readonly replaced_source: string | null;
}

async function tierRow(client: PoolClient, userId: number, phone: string): Promise<TierRow | null> {
  const found = await client.query<TierRow>(
    `SELECT contact_phone, tier, source, replaced_tier, replaced_source
       FROM human_relationship_tiers
      WHERE user_id = $1 AND regexp_replace(contact_phone, '\\D', '', 'g') = $2
      LIMIT 1 FOR UPDATE`,
    [userId, phoneDigits(phone)],
  );
  return found.rows[0] ?? null;
}

async function setPageTier(
  client: PoolClient,
  userId: number,
  phone: string,
  warmth: Warmth,
): Promise<void> {
  const existing = await tierRow(client, userId, phone);
  const tier = tierForWarmth(warmth);
  if (existing === null) {
    await client.query(
      `INSERT INTO human_relationship_tiers (user_id, contact_phone, tier, source, set_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, phone, tier, PAGE_TIER_SOURCE],
    );
    return;
  }
  // The tier it replaces is kept once: a second change on the page keeps the original.
  const keepsOriginal = existing.source === PAGE_TIER_SOURCE;
  await client.query(
    `UPDATE human_relationship_tiers
        SET tier = $3, source = $4, set_at = NOW(), replaced_tier = $5, replaced_source = $6
      WHERE user_id = $1 AND contact_phone = $2`,
    [
      userId,
      existing.contact_phone,
      tier,
      PAGE_TIER_SOURCE,
      keepsOriginal ? existing.replaced_tier : existing.tier,
      keepsOriginal ? existing.replaced_source : existing.source,
    ],
  );
}

async function clearPageTier(client: PoolClient, userId: number, phone: string): Promise<void> {
  const existing = await tierRow(client, userId, phone);
  if (existing === null || existing.source !== PAGE_TIER_SOURCE) return;
  if (existing.replaced_tier === null) {
    await client.query(
      'DELETE FROM human_relationship_tiers WHERE user_id = $1 AND contact_phone = $2',
      [userId, existing.contact_phone],
    );
    return;
  }
  await client.query(
    `UPDATE human_relationship_tiers
        SET tier = replaced_tier, source = COALESCE(replaced_source, $3), set_at = NOW(),
            replaced_tier = NULL, replaced_source = NULL
      WHERE user_id = $1 AND contact_phone = $2`,
    [userId, existing.contact_phone, PAGE_TIER_SOURCE],
  );
}

/** The owner's warmth for this contact; null goes back to what Netai infers. */
export async function setOwnWarmth(
  userId: number,
  phone: string,
  warmth: Warmth | null,
): Promise<void> {
  await withTransaction((client) =>
    warmth === null
      ? clearPageTier(client, userId, phone)
      : setPageTier(client, userId, phone, warmth),
  );
}

/** One label of the owner's own; the same label twice is kept once. */
export async function addOwnLabel(userId: number, phone: string, label: string): Promise<void> {
  await query(
    // Typed once each: $3 sits in the select list and in a comparison, and the
    // driver could not settle on one type for it (tester box 59368: a 500).
    `INSERT INTO "UserTags" ("contactId", phone, tag, "weightCount", source)
     SELECT $1::int, $2::varchar, $3::varchar, 1, $4::"TagSource"
      WHERE NOT EXISTS (
        SELECT 1 FROM "UserTags"
         WHERE "contactId" = $1::int AND regexp_replace(phone, '\\D', '', 'g') = $5
           AND tag = $3::varchar AND source = $4::"TagSource")`,
    [userId, phone, label.trim(), OWN_LABEL_SOURCE, phoneDigits(phone)],
    QUERY_TIMEOUT_MS,
  );
}

/** Removes only a label the owner wrote; an imported one is never touched. */
export async function removeOwnLabel(
  userId: number,
  phone: string,
  label: string,
): Promise<EditOutcome> {
  const removed = await query(
    `DELETE FROM "UserTags"
      WHERE "contactId" = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2
        AND tag = $3 AND source = $4`,
    [userId, phoneDigits(phone), label.trim(), OWN_LABEL_SOURCE],
    QUERY_TIMEOUT_MS,
  );
  return (removed.rowCount ?? 0) > 0 ? EditOutcome.Done : EditOutcome.NotFound;
}

/** The contact is left out of this one goal of the owner's; another person's goal is not found. */
export async function excludeFromGoal(
  userId: number,
  phone: string,
  goalId: number,
): Promise<EditOutcome> {
  const goal = await query<{ title: string }>(
    'SELECT title FROM tasks WHERE id = $1 AND user_id = $2 LIMIT 1',
    [goalId, userId],
    QUERY_TIMEOUT_MS,
  );
  const title = goal.rows[0]?.title?.trim();
  if (title === undefined || title === '') return EditOutcome.NotFound;
  await query(
    `INSERT INTO contact_exclusions (user_id, contact_phone, excluded_for, reason, goal_id)
     VALUES ($1, $2, $3, '', $4)
     ON CONFLICT (user_id, contact_phone, excluded_for) DO UPDATE SET goal_id = EXCLUDED.goal_id`,
    [userId, phoneDigits(phone), title, goalId],
    QUERY_TIMEOUT_MS,
  );
  return EditOutcome.Done;
}
