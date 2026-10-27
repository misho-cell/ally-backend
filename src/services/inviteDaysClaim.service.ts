import { query } from '../db/postgres/client';
import { hasActiveSubscription } from '../api/middleware/subscription.middleware';
import { startGuestDays } from './guestList.service';
import { grantCohortTrial } from './inviteCohorts.service';
import { subscribedInviter } from './inviteGate.service';
import { inviteFreeDays, inviteFreeDaysCohort } from './inviteReward.service';

/**
 * #6341 (launch 21 Oct; Lika's file via the founder): an invited account saw
 * the Pro page, tapped „გამოტოვება და უფასო ვერსიით გაგრძელება", and came back
 * to the same page — the link opened /chat, the server answered
 * `subscription_required`, and the app sent it to /pricing again. There was no
 * server door behind „continue free": the invitation's days are granted only
 * at /register, and only when the link's code reached it. Two accounts of
 * 16–17 Oct came in with no inviter on record and never got their days.
 *
 * This is that door. It grants the invitation's free days ONCE, to an account
 * that can show an invitation: a member's code the app still holds from the
 * link, the inviter already recorded on the account, or the guest list. With
 * none of them nothing is granted, and the app is told why, so it can say so
 * instead of looping.
 */
const CLAIM_QUERY_TIMEOUT_MS = 4_000;

export enum InviteDaysOutcome {
  Granted = 'granted',
  AlreadyHasAccess = 'already_has_access',
  AlreadyUsed = 'already_used',
  NoInvitation = 'no_invitation',
  FreeDaysOff = 'free_days_off',
}

export interface InviteDaysResult {
  readonly outcome: InviteDaysOutcome;
  readonly trialEndsAt: string | null;
}

interface ClaimAccount {
  readonly subscription_status: string;
  readonly trial_ends_at: string | null;
  readonly current_period_ends_at: string | null;
  readonly subscription_status_changed_at: string | null;
  readonly invite_cohort: string | null;
  readonly inviter: number | null;
  readonly phone: string | null;
  readonly trial_used: boolean;
}

async function readAccount(userId: string): Promise<ClaimAccount | undefined> {
  const result = await query<ClaimAccount>(
    `SELECT u.subscription_status, u.trial_ends_at, u.current_period_ends_at,
            u.subscription_status_changed_at, u.invite_cohort,
            u."inviterReferralUserId" AS inviter, p.phone,
            EXISTS (SELECT 1 FROM stripe_trial_consumed s
                     WHERE s.phone_digits = regexp_replace(p.phone, '\\D', '', 'g')) AS trial_used
       FROM "User" u
       LEFT JOIN LATERAL (SELECT phone FROM "UserPhone" WHERE "userId" = u.id
                           ORDER BY "createdAt" LIMIT 1) p ON true
      WHERE u.id = $1::int AND u."deletedAt" IS NULL`,
    [userId],
    CLAIM_QUERY_TIMEOUT_MS,
  );
  return result.rows[0];
}

async function trialEndsAt(userId: string): Promise<string | null> {
  const result = await query<{ trial_ends_at: Date | null }>(
    'SELECT trial_ends_at FROM "User" WHERE id = $1::int',
    [userId],
    CLAIM_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.trial_ends_at?.toISOString() ?? null;
}

async function recordInviter(userId: string, inviter: number): Promise<void> {
  await query(
    `UPDATE "User" SET "inviterReferralUserId" = COALESCE("inviterReferralUserId", $2),
            "updatedAt" = NOW()
      WHERE id = $1::int`,
    [userId, inviter],
    CLAIM_QUERY_TIMEOUT_MS,
  );
}

/**
 * Tester 77057 (founder, 27 Oct 22:05 Tbilisi): an old Ally account the founder
 * invited saw „no invitation found" — the link's code never reached the
 * server, and an invitation sent from inside Netai (invite_contact, the
 * invites table) was not read here. It is now: the latest invitation a member
 * sent to this account's number, when that member is subscribed (the same
 * person-invitation rule as the code, subscribedInviter).
 */
async function inviterByPhone(userId: string, phone: string): Promise<number | null> {
  const result = await query<{ referral_code: string }>(
    `SELECT i.referral_code
       FROM invites i
      WHERE regexp_replace(i.contact_phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
        AND i.user_id::text <> $2
        AND i.referral_code IS NOT NULL
      ORDER BY i.created_at DESC
      LIMIT 1`,
    [phone, userId],
    CLAIM_QUERY_TIMEOUT_MS,
  );
  return subscribedInviter(result.rows[0]?.referral_code);
}

/** The invitation's free days for this account, once, when it can show an invitation. */
export async function claimInviteDays(
  userId: string,
  referralCode?: string,
): Promise<InviteDaysResult> {
  const account = await readAccount(userId);
  if (account === undefined || account.phone === null) {
    return { outcome: InviteDaysOutcome.NoInvitation, trialEndsAt: null };
  }
  if (hasActiveSubscription(account)) {
    return { outcome: InviteDaysOutcome.AlreadyHasAccess, trialEndsAt: account.trial_ends_at };
  }
  if (await startGuestDays(Number(userId), account.phone)) {
    return { outcome: InviteDaysOutcome.Granted, trialEndsAt: await trialEndsAt(userId) };
  }
  if (account.invite_cohort !== null || account.trial_used) {
    return { outcome: InviteDaysOutcome.AlreadyUsed, trialEndsAt: null };
  }
  const fromCode = await subscribedInviter(referralCode);
  const inviter =
    fromCode !== null && String(fromCode) !== userId
      ? fromCode
      : (account.inviter ?? (await inviterByPhone(userId, account.phone)));
  if (inviter === null) return { outcome: InviteDaysOutcome.NoInvitation, trialEndsAt: null };
  const days = await inviteFreeDays();
  if (days === null) return { outcome: InviteDaysOutcome.FreeDaysOff, trialEndsAt: null };
  await recordInviter(userId, inviter);
  await grantCohortTrial(Number(userId), account.phone, inviteFreeDaysCohort(days));
  // No phone and no code in the line (D149): the two account ids are enough.
  // eslint-disable-next-line no-console
  console.log(`[invite-days] account ${userId}: ${days} days on the invitation of ${inviter}`);
  return { outcome: InviteDaysOutcome.Granted, trialEndsAt: await trialEndsAt(userId) };
}
