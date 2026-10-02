import { query } from '../db/postgres/client';

/**
 * Board #503 — Ninia, 2 October: there was no page showing whom the owner
 * invited and what became of each invitation. Everyone who registered through
 * an owner's link already carries that owner in `inviterReferralUserId`; this
 * reads them back for the profile, newest first, with one state each.
 *
 * Only people who registered appear: an invitation nobody opened has no person
 * behind it to name. The name is the one they registered with themselves.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_LISTED = 200;
const PAID_STATUSES: readonly string[] = ['active', 'past_due'];

export enum InviteState {
  Registered = 'registered',
  Trial = 'trial',
  Paid = 'paid',
}

export interface InvitedPerson {
  readonly name: string | null;
  readonly joined_at: string;
  readonly state: InviteState;
}

export function inviteStateOf(subscriptionStatus: string | null): InviteState {
  if (subscriptionStatus === 'trialing') return InviteState.Trial;
  if (subscriptionStatus !== null && PAID_STATUSES.includes(subscriptionStatus))
    return InviteState.Paid;
  return InviteState.Registered;
}

export async function listInvitedPeople(inviterUserId: string): Promise<InvitedPerson[]> {
  const result = await query<{
    name: string | null;
    created_at: Date;
    subscription_status: string | null;
  }>(
    `SELECT NULLIF(TRIM(name), '') AS name, "createdAt" AS created_at, subscription_status
       FROM "User"
      WHERE "inviterReferralUserId" = $1 AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT ${MAX_LISTED}`,
    [inviterUserId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    name: r.name,
    joined_at: new Date(r.created_at).toISOString(),
    state: inviteStateOf(r.subscription_status),
  }));
}
