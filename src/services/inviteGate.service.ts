import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';
import { EligibilityCheck } from '../types';

const INVITE_ONLY_FLAG = 'invite_only';
// subscription_status values that count as an active paying/trialing subscriber.
const SUBSCRIBED_STATUSES = ['active', 'trialing'];
// The registering phone must already sit in the contact books of at least this
// many subscribers, OR this many users of any kind ("the bubble knows them").
const MIN_SUBSCRIBED_OWNERS = 3;
const MIN_TOTAL_OWNERS = 20;

// Stored phones may predate normalization, so match both spellings.
function phoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  return normalized === phone ? [phone] : [phone, normalized];
}

export async function isInviteOnlyEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [INVITE_ONLY_FLAG],
  );
  return result.rows[0]?.enabled === true;
}

async function isPhoneRegistered(variants: string[]): Promise<boolean> {
  const result = await query<{ userId: number }>(
    'SELECT "userId" FROM "UserPhone" WHERE phone = ANY($1) LIMIT 1',
    [variants],
  );
  return (result.rowCount ?? 0) > 0;
}

async function passesSocialProof(variants: string[]): Promise<boolean> {
  const result = await query<{ total: string; subscribed: string }>(
    `SELECT COUNT(DISTINCT ua."contactId") AS total,
            COUNT(DISTINCT ua."contactId") FILTER (
              WHERE u.subscription_status = ANY($2) AND u."deletedAt" IS NULL
            ) AS subscribed
     FROM "UserAlias" ua
     LEFT JOIN "User" u ON u.id = ua."contactId"
     WHERE ua.phone = ANY($1)`,
    [variants, SUBSCRIBED_STATUSES],
  );
  const row = result.rows[0];
  const total = Number(row?.total ?? 0);
  const subscribed = Number(row?.subscribed ?? 0);
  return subscribed >= MIN_SUBSCRIBED_OWNERS || total >= MIN_TOTAL_OWNERS;
}

async function findSubscribedReferrer(referralPhone: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT u.id
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE up.phone = ANY($1)
       AND u."deletedAt" IS NULL
       AND u.subscription_status = ANY($2)
     LIMIT 1`,
    [phoneVariants(referralPhone), SUBSCRIBED_STATUSES],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Invite-only gate for new registrations. Order matters:
 * an already-known phone (social proof) enters with no referral asked;
 * a referral from a subscribed user is the fallback for unknown phones.
 */
export async function checkRegistrationEligibility(
  phone: string,
  referralPhone?: string,
): Promise<EligibilityCheck> {
  if (!(await isInviteOnlyEnabled())) {
    return { eligible: true, mode: 'open' };
  }

  const variants = phoneVariants(phone);

  if (await isPhoneRegistered(variants)) {
    return { eligible: true, mode: 'existing' };
  }

  if (await passesSocialProof(variants)) {
    return { eligible: true, mode: 'social' };
  }

  if (referralPhone !== undefined && referralPhone.trim() !== '') {
    const inviterUserId = await findSubscribedReferrer(referralPhone);
    if (inviterUserId !== null) {
      return { eligible: true, mode: 'referral', inviterUserId };
    }
    return { eligible: false, reason: 'referrer_not_subscribed' };
  }

  return { eligible: false, reason: 'referral_required' };
}
