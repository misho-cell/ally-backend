import { query } from '../db/postgres/client';

/**
 * #5611 (founder D808, 18 Oct 2026, for the 21 Oct launch). Two rules for a
 * join through a member's invitation link:
 *
 * (b) A link can carry a limit — at most `max_joins` people, and none after
 *     `ends_at` (Tornike's link in the Axel chat, Iro's in the CELA chat:
 *     150 joins, until 23 Oct 23:59 Tbilisi). No row, no limit.
 * (a) „A link works only between two people who have each other's number."
 *     The founder's D812 (18 Oct, 13:42 Tbilisi): only the inviter's side is
 *     checked — the inviter's phonebook must hold the new number. The rule has
 *     its own switch and starts OFF, like every door that refuses people: it
 *     is turned on after it is tested.
 */
export const MUTUAL_CONTACTS_FLAG = 'invite_mutual_contacts';
const LINK_QUERY_TIMEOUT_MS = 5_000;

export type LinkRefusal = 'invite_link_full' | 'invite_link_expired';

export interface InviteLinkLimit {
  readonly inviterUserId: number;
  readonly maxJoins: number;
  readonly countsFrom: Date;
  readonly endsAt: Date;
  readonly boardRow: string;
}

interface LimitRow {
  readonly inviter_user_id: number;
  readonly max_joins: number;
  readonly counts_from: Date | string;
  readonly ends_at: Date | string;
  readonly board_row: string;
}

function limitFrom(row: LimitRow): InviteLinkLimit {
  return {
    inviterUserId: row.inviter_user_id,
    maxJoins: row.max_joins,
    countsFrom: new Date(row.counts_from),
    endsAt: new Date(row.ends_at),
    boardRow: row.board_row,
  };
}

export async function inviteLinkLimitFor(inviterUserId: number): Promise<InviteLinkLimit | null> {
  const result = await query<LimitRow>(
    `SELECT inviter_user_id, max_joins, counts_from, ends_at, board_row
       FROM invite_link_limits WHERE inviter_user_id = $1`,
    [inviterUserId],
    LINK_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : limitFrom(row);
}

async function joinsSince(inviterUserId: number, since: Date): Promise<number> {
  const result = await query<{ joins: string }>(
    `SELECT COUNT(*) AS joins FROM "User"
      WHERE "inviterReferralUserId" = $1 AND "createdAt" >= $2`,
    [inviterUserId, since],
    LINK_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.joins ?? 0);
}

/** Why this inviter's link takes nobody more now; null when it still takes people. */
export async function linkLimitRefusal(
  inviterUserId: number,
  now: Date = new Date(),
): Promise<LinkRefusal | null> {
  const limit = await inviteLinkLimitFor(inviterUserId);
  if (limit === null) return null;
  if (now > limit.endsAt) return 'invite_link_expired';
  const joins = await joinsSince(inviterUserId, limit.countsFrom);
  return joins >= limit.maxJoins ? 'invite_link_full' : null;
}

export async function isMutualContactsEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [MUTUAL_CONTACTS_FLAG],
    LINK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.enabled === true;
}

/** Does the inviter's own phonebook hold this number, in any of its spellings? */
export async function inviterHasSaved(
  inviterUserId: number,
  phoneSpellings: readonly string[],
): Promise<boolean> {
  if (phoneSpellings.length === 0) return false;
  const result = await query<{ one: number }>(
    `SELECT 1 AS one FROM "UserAlias" WHERE "contactId" = $1 AND phone = ANY($2::text[])
     UNION ALL
     SELECT 1 FROM "UserTags" WHERE "contactId" = $1 AND phone = ANY($2::text[])
     LIMIT 1`,
    [inviterUserId, [...phoneSpellings]],
    LINK_QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

export interface LinkLimitInput {
  readonly inviterUserId: number;
  readonly maxJoins: number;
  readonly endsAt: Date;
  readonly boardRow: string;
}

/** Sets (or replaces) one inviter's limit; joins count from now. */
export async function setInviteLinkLimit(input: LinkLimitInput): Promise<InviteLinkLimit> {
  const result = await query<LimitRow>(
    `INSERT INTO invite_link_limits (inviter_user_id, max_joins, ends_at, board_row)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (inviter_user_id) DO UPDATE
       SET max_joins = EXCLUDED.max_joins, ends_at = EXCLUDED.ends_at,
           board_row = EXCLUDED.board_row
     RETURNING inviter_user_id, max_joins, counts_from, ends_at, board_row`,
    [input.inviterUserId, input.maxJoins, input.endsAt, input.boardRow],
    LINK_QUERY_TIMEOUT_MS,
  );
  return limitFrom(result.rows[0]);
}

export async function listInviteLinkLimits(): Promise<InviteLinkLimit[]> {
  const result = await query<LimitRow>(
    `SELECT inviter_user_id, max_joins, counts_from, ends_at, board_row
       FROM invite_link_limits ORDER BY inviter_user_id LIMIT 100`,
    [],
    LINK_QUERY_TIMEOUT_MS,
  );
  return result.rows.map(limitFrom);
}
