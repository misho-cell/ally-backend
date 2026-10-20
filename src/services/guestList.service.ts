import { query } from '../db/postgres/client';
import { grantCohortTrial, InviteCohort } from './inviteCohorts.service';
import { phoneDigits } from './phone';

/**
 * #6172 (launch 21 Oct; Lika's ask via the founder, 19 Oct): a GUEST LIST.
 *
 * The team adds numbers ahead of time, by group (Axel, later CELA), with the
 * free days (20 unless said) and who invites them. A listed number:
 *   * passes the invite-only gate as invited by the group's inviter, so the
 *     inviter link and the referral chain work as for any invitation;
 *   * gets its free days at its FIRST successful sign-in, not when it was
 *     added, and never sees the payment page until they end.
 * A number that is not listed and has no invitation is still stopped.
 *
 * The days run through `grantCohortTrial`, the one path that already spends
 * the person's Stripe trial at the door, with the group as the cohort code
 * („GUEST:<group>"), so „who came in through Axel's list" is one query.
 */
const GUEST_QUERY_TIMEOUT_MS = 4_000;
export const DEFAULT_GUEST_DAYS = 20;
export const MAX_GUEST_DAYS = 90;
export const MAX_GUESTS_PER_CALL = 500;
const MAX_GUESTS_LISTED = 1_000;
const GUEST_COHORT_PREFIX = 'GUEST:';
const GUEST_TIER = 'pro';

export interface Guest {
  readonly id: number;
  readonly phone_digits: string;
  readonly group_name: string;
  readonly free_days: number;
  readonly inviter_user_id: number | null;
  readonly user_id: number | null;
  readonly first_signin_at: Date | null;
}

export enum GuestState {
  Waiting = 'waiting',
  Active = 'active',
  Ended = 'ended',
}

export interface GuestRow {
  readonly id: number;
  readonly phone: string;
  readonly group: string;
  readonly free_days: number;
  readonly inviter_user_id: number | null;
  readonly state: GuestState;
  readonly signed_in_at: string | null;
  readonly days_left: number | null;
}

const MS_PER_DAY = 86_400_000;

/** The cohort a group's days are granted as. */
export function guestCohort(guest: Pick<Guest, 'group_name' | 'free_days'>): InviteCohort {
  return {
    code: `${GUEST_COHORT_PREFIX}${guest.group_name}`,
    name: `Guest list: ${guest.group_name}`,
    trial_days: guest.free_days,
    tier: GUEST_TIER,
    active: true,
    note: `guest list (#6172), ${guest.free_days} days from the first sign-in`,
    created_by: 'guest list',
    created_at: '',
  };
}

/** Where a listed number stands now: not signed in yet, inside its days, or past them. */
export function guestState(
  guest: Pick<Guest, 'first_signin_at' | 'free_days'>,
  now: Date = new Date(),
): { readonly state: GuestState; readonly daysLeft: number | null } {
  if (guest.first_signin_at === null) return { state: GuestState.Waiting, daysLeft: null };
  const ends = guest.first_signin_at.getTime() + guest.free_days * MS_PER_DAY;
  const left = Math.ceil((ends - now.getTime()) / MS_PER_DAY);
  return left > 0
    ? { state: GuestState.Active, daysLeft: left }
    : { state: GuestState.Ended, daysLeft: 0 };
}

/** The listed row for this number, or null. */
export async function guestFor(phone: string): Promise<Guest | null> {
  const digits = phoneDigits(phone);
  if (digits === '') return null;
  const result = await query<Guest>(
    `SELECT id, phone_digits, group_name, free_days, inviter_user_id, user_id, first_signin_at
       FROM guest_list WHERE phone_digits = $1 LIMIT 1`,
    [digits],
    GUEST_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

export interface NewGuests {
  readonly group: string;
  readonly days: number;
  readonly inviterUserId: number | null;
  readonly phones: readonly string[];
  readonly addedBy: string;
}

/**
 * Adds the numbers to the group. A number already listed keeps its row and its
 * start date; only a number not yet signed in moves to the new group and days.
 */
export async function addGuests(guests: NewGuests): Promise<{ added: number; invalid: number }> {
  const all = guests.phones.map(phoneDigits);
  const digits = [...new Set(all.filter((d) => d !== ''))];
  const invalid = all.filter((d) => d === '').length;
  if (digits.length === 0) return { added: 0, invalid };
  const result = await query(
    `INSERT INTO guest_list (phone_digits, group_name, free_days, inviter_user_id, added_by)
     SELECT d, $2, $3, $4, $5 FROM unnest($1::text[]) AS d
     ON CONFLICT (phone_digits) DO UPDATE
        SET group_name = EXCLUDED.group_name, free_days = EXCLUDED.free_days,
            inviter_user_id = EXCLUDED.inviter_user_id
      WHERE guest_list.first_signin_at IS NULL`,
    [digits, guests.group, guests.days, guests.inviterUserId, guests.addedBy],
    GUEST_QUERY_TIMEOUT_MS,
  );
  return { added: result.rowCount ?? 0, invalid };
}

/** The list with each number's state, newest first; one group or all. */
export async function listGuests(group: string | null): Promise<GuestRow[]> {
  const result = await query<Guest>(
    `SELECT id, phone_digits, group_name, free_days, inviter_user_id, user_id, first_signin_at
       FROM guest_list WHERE ($1::text IS NULL OR group_name = $1)
      ORDER BY added_at DESC, id DESC
      LIMIT $2`,
    [group, MAX_GUESTS_LISTED],
    GUEST_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((guest) => {
    const { state, daysLeft } = guestState(guest);
    return {
      id: guest.id,
      phone: `+${guest.phone_digits}`,
      group: guest.group_name,
      free_days: guest.free_days,
      inviter_user_id: guest.inviter_user_id,
      state,
      signed_in_at: guest.first_signin_at?.toISOString() ?? null,
      days_left: daysLeft,
    };
  });
}

/**
 * New days for a whole group or one number. Someone already inside their days
 * gets the new length counted from their first sign-in; someone whose days
 * have ended is left as they are (the founder's „everyone not yet ended").
 */
export async function setGuestDays(
  target: { readonly group: string } | { readonly id: number },
  days: number,
): Promise<number> {
  const byGroup = 'group' in target;
  const result = await query(
    `UPDATE guest_list SET free_days = $2
      WHERE ${byGroup ? 'group_name = $1' : 'id = $1::int'}
        AND (first_signin_at IS NULL OR first_signin_at + make_interval(days => free_days) > NOW())`,
    [byGroup ? target.group : target.id, days],
    GUEST_QUERY_TIMEOUT_MS,
  );
  await query(
    `UPDATE "User" u
        SET trial_ends_at = g.first_signin_at + make_interval(days => g.free_days), "updatedAt" = NOW()
       FROM guest_list g
      WHERE g.user_id = u.id AND ${byGroup ? 'g.group_name = $1' : 'g.id = $1::int'}
        AND g.first_signin_at IS NOT NULL AND u.subscription_status = 'trialing'
        AND u.invite_cohort = $2 || g.group_name
        AND u.trial_ends_at > NOW()`,
    [byGroup ? target.group : target.id, GUEST_COHORT_PREFIX],
    GUEST_QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

/**
 * At a successful sign-in: a listed number not yet started gets its days now,
 * and its inviter if the account has none. An account that already pays is
 * left as it is; the start is still stamped, so the list shows the sign-in.
 * True when the days were granted.
 */
export async function startGuestDays(userId: number, phone: string): Promise<boolean> {
  const guest = await guestFor(phone);
  if (guest === null || guest.first_signin_at !== null) return false;
  const claimed = await query(
    `UPDATE guest_list SET first_signin_at = NOW(), user_id = $2
      WHERE id = $1 AND first_signin_at IS NULL`,
    [guest.id, userId],
    GUEST_QUERY_TIMEOUT_MS,
  );
  if ((claimed.rowCount ?? 0) === 0) return false;
  const account = await query<{ paying: boolean }>(
    `UPDATE "User"
        SET "inviterReferralUserId" = COALESCE("inviterReferralUserId", $2), "updatedAt" = NOW()
      WHERE id = $1
      RETURNING (subscription_status = 'active' AND current_period_ends_at > NOW()) AS paying`,
    [userId, guest.inviter_user_id],
    GUEST_QUERY_TIMEOUT_MS,
  );
  if (account.rows[0]?.paying === true) return false;
  await grantCohortTrial(userId, phone, guestCohort(guest));
  // No phone in the line (D149): the account id and the group are enough.
  // eslint-disable-next-line no-console
  console.log(
    `[guest-list] account ${userId}: ${guest.free_days} days from the „${guest.group_name}" list`,
  );
  return true;
}
