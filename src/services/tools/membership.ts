import { query } from '../../db/postgres/client';
import { phoneDigits } from '../phone';

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
 * "Has actually used Netai" has no single column, so it is the union of the
 * three things only Netai writes: a conversation thread, a search, or a
 * subscription. Threads alone give 38 people and all three give 42 — the
 * difference is four people who subscribed or searched without a thread
 * surviving, and counting them as users is the safe direction: mislabelling a
 * real user as a target would put them on an invitation list.
 */
const NETAI_ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'];

/**
 * The account state of each given phone, keyed by its digits. Phones with no
 * account are absent from the map rather than mapped to `none` — the caller
 * reads through `accountStateFor`, which supplies the default.
 *
 * The compare is format-independent ON BOTH SIDES: `"UserPhone".phone` was
 * written unnormalized for years ("+995 599 …", "995599…"), and an exact
 * string match read genuine accounts as absent — the "member in one request,
 * non-member three minutes later" defect. Backed by the expression index
 * idx_user_phone_digits (migration 047); the two EXISTS checks ride
 * idx_threads_user_id and idx_search_activity_user_time.
 */
export async function fetchAccountStates(phones: string[]): Promise<Map<string, AccountState>> {
  const digits = [...new Set(phones.map(phoneDigits))].filter(Boolean);
  const states = new Map<string, AccountState>();
  if (digits.length === 0) return states;
  const result = await query<{ phone: string; netai_user: boolean }>(
    `SELECT DISTINCT up.phone,
            (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
             OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
             OR u.subscription_status = ANY($2::text[])) AS netai_user
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = ANY($1) AND u."deletedAt" IS NULL`,
    [digits, NETAI_ACTIVE_SUBSCRIPTION_STATUSES],
    MEMBER_TIMEOUT_MS,
  );
  for (const row of result.rows) {
    const key = phoneDigits(row.phone);
    // One person can hold several phones and several rows; a single Netai
    // signal on any of them makes them a Netai user.
    if (row.netai_user || !states.has(key)) {
      states.set(key, row.netai_user ? 'netai_user' : 'ally_account');
    }
  }
  return states;
}

/** The state of one phone, given a map from fetchAccountStates. */
export function accountStateFor(states: Map<string, AccountState>, phone: string): AccountState {
  return states.get(phoneDigits(phone)) ?? 'none';
}

/**
 * `is_member` as the assistant reads it: a Netai user, not merely an account.
 * An old-Ally account is deliberately false here — it is a target.
 */
export function isMemberPhone(states: Map<string, AccountState>, phone: string): boolean {
  return accountStateFor(states, phone) === 'netai_user';
}
