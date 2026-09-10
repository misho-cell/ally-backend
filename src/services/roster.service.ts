import { query } from '../db/postgres/client';
import { normalizePhone, phoneDigits } from './phone';

/**
 * A roster: the members of a named network, as the public `member_of` facts
 * state them (THE TARGETS target 9; Ticket 10 Task 23, D121).
 *
 * The founder's ruling of 7 September: Axel membership is enough to approach
 * another member's assistant, even without personal acquaintance — members
 * must be Netai users, an old-Ally account alone is not enough. Until now
 * an ask needed a contact from the sender's own phonebook, and the search
 * tools only ever surfaced the sender's own contacts, so two members who had
 * never saved each other's number could not reach each other at all.
 *
 * This module answers three questions and nothing else: who is on a roster,
 * is this user on it, and do two users share one. Sending is still the ask
 * path's, with every gate it already has.
 */

const ROSTER_QUERY_TIMEOUT_MS = 8_000;
const ROSTER_LIMIT = 200;
const NETAI_LIVE_STATUSES = ['active', 'trialing', 'past_due'];

export interface RosterMember {
  user_id: number | null;
  name: string | null;
  phone: string;
  /** Has actually used Netai — the only kind of member an ask can reach. */
  on_netai: boolean;
  /** What the roster fact calls the group, as written. */
  group: string;
}

function groupPattern(group: string): string {
  return `%${group.trim().toLowerCase()}%`;
}

/** Everyone the public facts place in this group, with the account behind each phone. */
export async function rosterMembers(group: string): Promise<RosterMember[]> {
  const pattern = groupPattern(group);
  if (pattern === '%%') return [];
  const result = await query<{
    phone: string;
    group: string;
    user_id: number | null;
    name: string | null;
    on_netai: boolean | null;
  }>(
    `SELECT DISTINCT ON (f.neo4j_contact_id)
            f.neo4j_contact_id AS phone,
            COALESCE(f.canonical_value, f.value) AS group,
            u.id AS user_id,
            -- Ticket 14 Task 88: 27 of 50 roster rows came back nameless — most
            -- members are not registered, so "User".name is null for them. The
            -- name the network saves them under is the fallback.
            COALESCE(NULLIF(TRIM(u.name), ''), top_alias.alias) AS name,
            (u.id IS NOT NULL AND (
               EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
               OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
               OR u.subscription_status = ANY($2::text[]))) AS on_netai
     FROM contact_facts f
     LEFT JOIN "UserPhone" up
       ON regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace(f.neo4j_contact_id, '\\D', '', 'g')
     LEFT JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
     LEFT JOIN LATERAL (
       SELECT a.alias
       FROM "UserAlias" a
       WHERE a.phone = f.neo4j_contact_id AND a.alias IS NOT NULL AND TRIM(a.alias) <> ''
       GROUP BY a.alias
       ORDER BY COUNT(*) DESC, LENGTH(a.alias) DESC
       LIMIT 1
     ) top_alias ON TRUE
     WHERE f.field_type = 'member_of' AND f.is_public AND f.retracted_at IS NULL
       AND LOWER(COALESCE(f.canonical_value, f.value)) LIKE $1
     ORDER BY f.neo4j_contact_id, u.id
     LIMIT $3`,
    [pattern, NETAI_LIVE_STATUSES, ROSTER_LIMIT],
    ROSTER_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    phone: r.phone,
    on_netai: r.on_netai === true,
    group: r.group,
  }));
}

/** Is this account itself on the roster? Its own phones against the roster's. */
export async function isOnRoster(userId: string, group: string): Promise<boolean> {
  const members = await rosterMembers(group);
  return members.some((m) => m.user_id !== null && String(m.user_id) === userId);
}

/**
 * The roster two accounts share, or null. Read at send time so the recipient's
 * opening line can say "an Axel member is asking" (D57) — the whole reason a
 * stranger's question is not spam to them.
 */
export async function sharedRoster(
  fromUserId: string,
  toUserId: string,
  groups: readonly string[] = ['Axel'],
): Promise<string | null> {
  for (const group of groups) {
    const members = await rosterMembers(group);
    const ids = new Set(members.filter((m) => m.user_id !== null).map((m) => String(m.user_id)));
    if (ids.has(fromUserId) && ids.has(toUserId)) return group;
  }
  return null;
}

/** Roster rows whose name carries every word of the query (empty query = all). */
export function filterRoster(members: readonly RosterMember[], nameQuery: string): RosterMember[] {
  const words = nameQuery
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return [...members];
  return members.filter((m) => {
    const hay = (m.name ?? '').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Digits of the roster phones, for callers that compare numbers not ids. */
export function rosterDigits(members: readonly RosterMember[]): Set<string> {
  return new Set(members.map((m) => phoneDigits(m.phone)).filter(Boolean));
}

// The 84 Axel rows of 5 September were written by the founder's account as
// curator, public and matchable, canonical = the group's name, source 'sweep'
// (the only import-shaped value the column's CHECK allows). One more member
// takes exactly that shape, so the roster stays one kind of row.
const ROSTER_FACT_SOURCE = 'sweep';
const ROSTER_FACT_CONFIDENCE = 'stated';

export interface RosterChange {
  changed: boolean;
  phone: string;
  group: string;
  fact_id: number | null;
}

/**
 * Put one person on a roster (Ticket 12 Task 10: the founder himself was not
 * on the Axel list he confirmed, so his own membership opened no door). Idempotent:
 * a live row for the same phone and group changes nothing.
 */
export async function addRosterMember(
  group: string,
  phone: string,
  curatorUserId: string,
  opts: { former?: boolean } = {},
): Promise<RosterChange> {
  const name = group.trim();
  const normalized = normalizePhone(phone);
  if (name === '' || !normalized) return { changed: false, phone, group: name, fact_id: null };
  // A FORMER member (Ticket 13 B3 (4)) is loaded with a flag and never as a
  // member for reach: an `affiliation` fact, which the roster query does not
  // read, instead of `member_of`.
  const fieldType = opts.former === true ? 'affiliation' : 'member_of';
  const value = opts.former === true ? `${name} (former member)` : name;
  const existing = await query<{ id: number }>(
    `SELECT id FROM contact_facts
     WHERE neo4j_contact_id = $1 AND field_type = $3 AND retracted_at IS NULL
       AND LOWER(COALESCE(canonical_value, value)) = LOWER($2)
     LIMIT 1`,
    [normalized, value, fieldType],
    ROSTER_QUERY_TIMEOUT_MS,
  );
  const found = existing.rows[0];
  if (found) return { changed: false, phone: normalized, group: name, fact_id: found.id };
  const inserted = await query<{ id: number }>(
    `INSERT INTO contact_facts (neo4j_contact_id, submitted_by_user_id, field_type, value,
                                is_public, is_matchable, canonical_value, moderated_at, source, confidence)
     VALUES ($1, $2, $6, $3, true, true, $3, NOW(), $4, $5)
     RETURNING id`,
    [normalized, curatorUserId, value, ROSTER_FACT_SOURCE, ROSTER_FACT_CONFIDENCE, fieldType],
    ROSTER_QUERY_TIMEOUT_MS,
  );
  return { changed: true, phone: normalized, group: name, fact_id: inserted.rows[0]?.id ?? null };
}

/** Take one person off a roster — a soft retract of the membership row; the undo of addRosterMember. */
export async function removeRosterMember(group: string, phone: string): Promise<RosterChange> {
  const name = group.trim();
  const normalized = normalizePhone(phone);
  if (name === '' || !normalized) return { changed: false, phone, group: name, fact_id: null };
  const result = await query<{ id: number }>(
    `UPDATE contact_facts SET retracted_at = NOW(), updated_at = NOW()
     WHERE neo4j_contact_id = $1 AND field_type = 'member_of' AND retracted_at IS NULL
       AND LOWER(COALESCE(canonical_value, value)) = LOWER($2)
     RETURNING id`,
    [normalized, name],
    ROSTER_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return { changed: row !== undefined, phone: normalized, group: name, fact_id: row?.id ?? null };
}
