import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';

/**
 * Accounts that never vouch for anyone (migration 266; Misho, 24 Oct): copies
 * of one real member's phonebook that "knew" everyone. Never a bridge, a path
 * link or a reverse-tie holder. Nothing in them is deleted or changed.
 */

const EXCLUDED_QUERY_TIMEOUT_MS = 3_000;
/**
 * The list changes rarely (a migration, a test seat, a team account set by an admin), so a
 * short cache spares every walk a read. A change clears this process's cache at once; another
 * running instance reads it within this window.
 */
const EXCLUDED_CACHE_MS = 10 * 60_000;
const MAX_EXCLUDED_PHONES = 1_000;

/** SQL: this account is not one that never vouches. `idExpr` is a column we write, never input. */
export function notAnExcludedHolder(idExpr: string): string {
  return `NOT EXISTS (SELECT 1 FROM excluded_holders eh WHERE eh.user_id = ${idExpr})`;
}

let cached: { readonly at: number; readonly phones: ReadonlySet<string> } | null = null;

/** The numbers of the accounts that never vouch, normalized; empty when unreadable. */
export async function excludedHolderPhones(now: number = Date.now()): Promise<ReadonlySet<string>> {
  if (cached !== null && now - cached.at < EXCLUDED_CACHE_MS) return cached.phones;
  try {
    const result = await query<{ phone: string }>(
      `SELECT up.phone FROM "UserPhone" up
         JOIN excluded_holders eh ON eh.user_id = up."userId"
        LIMIT $1`,
      [MAX_EXCLUDED_PHONES],
      EXCLUDED_QUERY_TIMEOUT_MS,
    );
    cached = { at: now, phones: new Set(result.rows.map((r) => normalizePhone(r.phone))) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[excluded-holders] not read, nothing excluded:', (err as Error).message);
    return new Set();
  }
  return cached.phones;
}

/** Tests only: forget the cached list. */
export function forgetExcludedHolders(): void {
  cached = null;
}

const TEST_SEAT_REASON = 'test_seat';

export enum SeatExclusion {
  Set = 'set',
  Cleared = 'cleared',
  NotATestSeat = 'not_a_test_seat',
}

/**
 * Tester 75911 (25 Oct): the plan card's groups leave excluded holders out
 * (0fc7629f), and testing that needs one on a fictional seat. A test seat — and
 * only a test seat — may be made one, or no longer one. A real account changes by
 * migration, or as a Netai team account (setTeamAccountExcluded).
 */
export async function setSeatExcluded(
  seatUserId: number,
  excluded: boolean,
): Promise<SeatExclusion> {
  const seat = await query<{ user_id: number }>(
    'SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1',
    [seatUserId],
    EXCLUDED_QUERY_TIMEOUT_MS,
  );
  if (seat.rows.length === 0) return SeatExclusion.NotATestSeat;
  if (excluded) {
    await query(
      `INSERT INTO excluded_holders (user_id, reason) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [seatUserId, TEST_SEAT_REASON],
      EXCLUDED_QUERY_TIMEOUT_MS,
    );
  } else {
    await query(
      'DELETE FROM excluded_holders WHERE user_id = $1 AND reason = $2',
      [seatUserId, TEST_SEAT_REASON],
      EXCLUDED_QUERY_TIMEOUT_MS,
    );
  }
  forgetExcludedHolders();
  return excluded ? SeatExclusion.Set : SeatExclusion.Cleared;
}

const TEAM_REASON = 'netai_team';
/** The most team accounts one listing returns. */
export const MAX_TEAM_ACCOUNTS_LISTED = 200;

export enum TeamAccountExclusion {
  Set = 'set',
  Cleared = 'cleared',
  /** Already never a bridge for another reason (a copied phonebook, a test seat): left as it is. */
  ExcludedForAnotherReason = 'excluded_for_another_reason',
  /** Not marked as a team account, so there was nothing to clear. */
  NotATeamAccount = 'not_a_team_account',
  NoSuchUser = 'no_such_user',
}

/**
 * #8623 (DR10): a member of the Netai team is never a route — a real member got
 * one's own account as their first route three times. Who is on the team is set
 * by Misho or ops through the admin route, never written into git. Only rows
 * with this reason are written or removed; the test-seat and copied-phonebook
 * rows are never touched here.
 */
export async function setTeamAccountExcluded(
  userId: number,
  excluded: boolean,
): Promise<TeamAccountExclusion> {
  const user = await query<{ id: number }>(
    'SELECT id FROM "User" WHERE id = $1 LIMIT 1',
    [userId],
    EXCLUDED_QUERY_TIMEOUT_MS,
  );
  if (user.rows.length === 0) return TeamAccountExclusion.NoSuchUser;
  const outcome = excluded ? await markTeamAccount(userId) : await unmarkTeamAccount(userId);
  if (outcome === TeamAccountExclusion.Set || outcome === TeamAccountExclusion.Cleared) {
    forgetExcludedHolders();
  }
  return outcome;
}

async function markTeamAccount(userId: number): Promise<TeamAccountExclusion> {
  const inserted = await query(
    `INSERT INTO excluded_holders (user_id, reason) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, TEAM_REASON],
    EXCLUDED_QUERY_TIMEOUT_MS,
  );
  if ((inserted.rowCount ?? 0) > 0) return TeamAccountExclusion.Set;
  const existing = await query<{ reason: string }>(
    'SELECT reason FROM excluded_holders WHERE user_id = $1 LIMIT 1',
    [userId],
    EXCLUDED_QUERY_TIMEOUT_MS,
  );
  return existing.rows[0]?.reason === TEAM_REASON
    ? TeamAccountExclusion.Set
    : TeamAccountExclusion.ExcludedForAnotherReason;
}

async function unmarkTeamAccount(userId: number): Promise<TeamAccountExclusion> {
  const deleted = await query(
    'DELETE FROM excluded_holders WHERE user_id = $1 AND reason = $2',
    [userId, TEAM_REASON],
    EXCLUDED_QUERY_TIMEOUT_MS,
  );
  return (deleted.rowCount ?? 0) > 0
    ? TeamAccountExclusion.Cleared
    : TeamAccountExclusion.NotATeamAccount;
}

/** The user ids marked as Netai team accounts, ids only, oldest mark first. */
export async function listTeamAccounts(): Promise<readonly number[]> {
  const result = await query<{ user_id: number }>(
    `SELECT user_id FROM excluded_holders WHERE reason = $1
      ORDER BY created_at, user_id LIMIT $2`,
    [TEAM_REASON, MAX_TEAM_ACCOUNTS_LISTED],
    EXCLUDED_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => Number(r.user_id));
}
