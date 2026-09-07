import { query } from '../../db/postgres/client';
import { phoneDigits } from '../phone';
import { isStaffUser } from '../staff';

const MEMBER_TIMEOUT_MS = 8_000;

/**
 * The three states of a person (targeting logic Rule 13, founder D102–D104,
 * 3 September 2026). His words: *"you have to understand difference between
 * registered user of old ally, even paid user of old ally and registered user
 * on netai... so main idea is to differentiate netai and ally users."*
 *
 * - `none` — a phonebook contact with no account at all (~2.5 million people).
 * - `ally_account` — a row in the shared user table, possibly an old-Ally
 *   paying customer, who has NEVER opened Netai. 62,146 people on 3 September.
 * - `netai_user` — has actually used Netai. 38 people had opened a thread,
 *   42 counting search activity and subscribers.
 *
 * Until today one flag covered all three: `is_member` meant "has a row in the
 * user table", so it read true for 62,184 accounts of which 42 have ever used
 * the product. That flag drives the assistant's steering — "already on Ally →
 * activate, don't pitch", "reach a member through their assistant" — so an
 * introduction could be routed to the assistant of someone who has never seen
 * one, and 62,146 real targets were treated as existing users.
 *
 * `is_member` now means `netai_user` and nothing else. `ally_account` is a
 * TARGET: we hold the account, so we can reach them directly.
 */
export type AccountState = 'none' | 'ally_account' | 'netai_user';

/**
 * The other half of the picture (Ticket 10 Task 9): the state says whether
 * they have used Netai; these say whether they PAY for it, whether they paid
 * for old Ally, and whether they are one of us.
 *
 * Old-Ally paid has no status column of its own — the old app sold one thing,
 * the premium map, and stamped `boughtPremiumMapAt` when it was bought and
 * `cancelledPremiumMapAt` when it was cancelled. "Old-Ally paying customer" is
 * therefore: bought, and not cancelled. That is the one line the tester asked
 * for on how the status is stored.
 */
export interface AccountDetails {
  state: AccountState;
  /** The account behind the phone — two phones with one id are ONE person. */
  user_id: number | null;
  /** A live Netai subscription: active, trialing, or a card being retried. */
  netai_subscriber: boolean;
  /** Bought the old Ally premium map and never cancelled it. */
  old_ally_paid: boolean;
  /** Staff, ex-staff, a curator or a review number — never a target. */
  staff: boolean;
}

/**
 * "Has actually used Netai" has no single column, so it is the union of the
 * three things only Netai writes: a conversation thread, a search, or a
 * subscription. Threads alone give 38 people and all three give 42 — the
 * difference is four people who subscribed or searched without a thread
 * surviving, and counting them as users is the safe direction: mislabelling a
 * real user as a target would put them on an invitation list.
 */
const NETAI_ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'];

const NONE: AccountDetails = {
  state: 'none',
  user_id: null,
  netai_subscriber: false,
  old_ally_paid: false,
  staff: false,
};

/**
 * The account behind each given phone, keyed by its digits. Phones with no
 * account are absent from the map rather than mapped to `none` — the caller
 * reads through `accountStateFor` / `accountDetailsFor`, which supply the default.
 *
 * The compare is format-independent ON BOTH SIDES: `"UserPhone".phone` was
 * written unnormalized for years ("+995 599 …", "995599…"), and an exact
 * string match read genuine accounts as absent — the "member in one request,
 * non-member three minutes later" defect. Backed by the expression index
 * idx_user_phone_digits (migration 047); the two EXISTS checks ride
 * idx_threads_user_id and idx_search_activity_user_time.
 */
export async function fetchAccountStates(phones: string[]): Promise<Map<string, AccountDetails>> {
  const digits = [...new Set(phones.map(phoneDigits))].filter(Boolean);
  const details = new Map<string, AccountDetails>();
  if (digits.length === 0) return details;
  const result = await query<{
    phone: string;
    user_id: number;
    netai_user: boolean;
    netai_subscriber: boolean | null;
    old_ally_paid: boolean | null;
  }>(
    `SELECT DISTINCT up.phone, u.id AS user_id,
            (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
             OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
             OR u.subscription_status = ANY($2::text[])) AS netai_user,
            (u.subscription_status = ANY($2::text[])) AS netai_subscriber,
            (u."boughtPremiumMapAt" IS NOT NULL AND u."cancelledPremiumMapAt" IS NULL)
              AS old_ally_paid
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = ANY($1) AND u."deletedAt" IS NULL`,
    [digits, NETAI_ACTIVE_SUBSCRIPTION_STATUSES],
    MEMBER_TIMEOUT_MS,
  );
  for (const row of result.rows) {
    const key = phoneDigits(row.phone);
    const current = details.get(key) ?? NONE;
    // One person can hold several phones and several rows; a single Netai
    // signal on any of them makes them a Netai user, and any row's payment or
    // staff flag stands for the person.
    details.set(key, {
      state: row.netai_user || current.state === 'netai_user' ? 'netai_user' : 'ally_account',
      user_id: current.user_id ?? (typeof row.user_id === 'number' ? row.user_id : null),
      netai_subscriber: current.netai_subscriber || row.netai_subscriber === true,
      old_ally_paid: current.old_ally_paid || row.old_ally_paid === true,
      staff: current.staff || isStaffUser(row.user_id),
    });
  }
  return details;
}

/** Everything known about one phone's account, given a map from fetchAccountStates. */
export function accountDetailsFor(
  details: Map<string, AccountDetails>,
  phone: string,
): AccountDetails {
  return details.get(phoneDigits(phone)) ?? NONE;
}

/** The state of one phone, given a map from fetchAccountStates. */
export function accountStateFor(details: Map<string, AccountDetails>, phone: string): AccountState {
  return accountDetailsFor(details, phone).state;
}

/**
 * `is_member` as the assistant reads it: a Netai user, not merely an account.
 * An old-Ally account is deliberately false here — it is a target.
 */
export function isMemberPhone(details: Map<string, AccountDetails>, phone: string): boolean {
  return accountStateFor(details, phone) === 'netai_user';
}

/** Does this phone's account pay for Netai today? */
export function isSubscriberPhone(details: Map<string, AccountDetails>, phone: string): boolean {
  return accountDetailsFor(details, phone).netai_subscriber;
}
