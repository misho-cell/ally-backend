import { query } from '../db/postgres/client';
import { encodeContactRef } from './mcp/contactRef';
import { shownName } from './contactBook.service';

/**
 * The frontend's 14 Oct 14:10Z item 2 („ადამიანების პარამეტრები", phone 37):
 * in one read, the people this person kept out of a goal and the topics they
 * do not want to be asked about, each with the id that takes it back. Only
 * their own rows. Blocked people have their own read (/profile/blocked).
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_ROWS = 100;

export interface ExclusionSetting {
  readonly id: number;
  /** The contact id the contact page takes (/contacts/:id). */
  readonly contact_id: string;
  readonly name: string | null;
  readonly excluded_for: string;
  readonly reason: string | null;
}

export interface BoundarySetting {
  /** Takes the whole topic back: DELETE /profile/boundaries/:id. */
  readonly id: number;
  readonly topic: string;
  readonly terms: readonly string[];
}

export interface PeopleSettings {
  readonly exclusions: readonly ExclusionSetting[];
  readonly boundaries: readonly BoundarySetting[];
}

interface ExclusionRow {
  readonly id: number;
  readonly contact_phone: string;
  readonly alias: string | null;
  readonly excluded_for: string;
  readonly reason: string | null;
}

async function exclusionsOf(userId: number): Promise<ExclusionSetting[]> {
  const result = await query<ExclusionRow>(
    `SELECT e.id, e.contact_phone, e.excluded_for, e.reason,
            (SELECT a.alias FROM "UserAlias" a
              WHERE a."contactId" = e.user_id
                AND regexp_replace(a.phone, '\\D', '', 'g') = e.contact_phone
              ORDER BY LENGTH(COALESCE(a.alias, '')) DESC LIMIT 1) AS alias
       FROM contact_exclusions e
      WHERE e.user_id = $1::int
      ORDER BY e.created_at DESC
      LIMIT $2`,
    [userId, MAX_ROWS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    id: r.id,
    contact_id: encodeContactRef(String(userId), r.contact_phone),
    name: shownName(r.alias),
    excluded_for: r.excluded_for,
    reason: r.reason,
  }));
}

async function boundariesOf(userId: number): Promise<BoundarySetting[]> {
  const result = await query<{ id: number; topic: string; terms: string[] }>(
    `SELECT MIN(id)::int AS id, topic, ARRAY_AGG(term ORDER BY id) AS terms
       FROM ask_boundaries
      WHERE user_id = $1::int
      GROUP BY topic
      ORDER BY MIN(created_at)
      LIMIT $2`,
    [userId, MAX_ROWS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export async function peopleSettings(userId: number): Promise<PeopleSettings> {
  const [exclusions, boundaries] = await Promise.all([exclusionsOf(userId), boundariesOf(userId)]);
  return { exclusions, boundaries };
}

/** One of the person's topic boundaries taken back, with every term it carries. */
export async function removeOwnBoundary(userId: number, boundaryId: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM ask_boundaries
      WHERE user_id = $1::int
        AND topic = (SELECT topic FROM ask_boundaries WHERE id = $2 AND user_id = $1::int)`,
    [userId, boundaryId],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
