/**
 * WHAT „THIS PERSON IS ON NETAI" MEANS — one definition, for every reader.
 *
 * ⚠️ IT MEANT TWO DIFFERENT THINGS, AND A TESTER FOUND IT BY COMPARING TWO
 * SCREENS. Sofo (172497) registered through the founder's Netai invite on
 * 25 September. `/admin/users` called her `netai_user`; the referral tree
 * called her `ally_account`. Both were reading honestly and neither was
 * reading the same rule:
 *
 *   /admin/users   a thread OR a search OR a live subscription
 *   referral tree  a thread, and nothing else
 *
 * She has no thread yet and a trial subscription, so she fell between them.
 *
 * ⚠️ AND THE LABEL IS NOT COSMETIC. The connector's own instructions say an
 * `ally_account` „has never opened Netai — it is a target, not a member." So
 * the tree was telling the product to SELL Netai to somebody who had joined it
 * that morning. A wrong number would have been a reporting fault; this was
 * about to reach a person.
 *
 * Measured across the 805 invitees: 8 by the thread rule, 15 by the other.
 * Nearly double, and the eight was the number in front of the founder.
 *
 * ⚠️ `hasAccessToAlly` IS STILL NOT THE ANSWER, and that part of the tree's
 * reasoning was right and is kept: `registerUser` writes it as a literal true
 * for every Netai registrant, so it cannot tell the two populations apart.
 */

/** A subscription in any of these is somebody Netai is currently serving. */
export const NETAI_LIVE_STATUSES = ['active', 'trialing', 'past_due'];

/**
 * ⚠️ TWO QUESTIONS, TWO NAMES, because collapsing them is what caused this.
 *
 * JOINED  — they arrived: registered through Netai, or are being served by it
 *           now. This is the one the POPULATION label rests on, because the
 *           opposite of it is „never heard of us", and that is who a pitch is
 *           for.
 * USED    — they actually opened a conversation. This is the one a growth
 *           number rests on, because arriving and using are different things
 *           and the difference is the whole funnel.
 *
 * A reader that wants „opened Netai" has to say WHICH, and neither name lets
 * it avoid the choice.
 */
function statusList(): string {
  // Our own constant, never user input, so it is written into the SQL rather
  // than bound — a bound parameter cannot be shared between queries whose
  // other placeholders are numbered differently, and that mismatch is exactly
  // how one of these readers would drift from the others again.
  return NETAI_LIVE_STATUSES.map((s) => `'${s}'`).join(', ');
}

/**
 * `alias` is the SQL alias of the `"User"` row in the calling query. It is
 * written by us at every call site and never comes from a request; the type
 * says string because SQL aliases are not values and cannot be bound.
 */
export function joinedNetai(alias: string): string {
  return `(EXISTS (SELECT 1 FROM threads t WHERE t.user_id = ${alias}.id)
           OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = ${alias}.id::text)
           OR ${alias}.subscription_status IN (${statusList()}))`;
}

/** Actually opened a conversation. A strict subset of `joinedNetai`. */
export function usedNetai(alias: string): string {
  return `EXISTS (SELECT 1 FROM threads t WHERE t.user_id = ${alias}.id)`;
}
