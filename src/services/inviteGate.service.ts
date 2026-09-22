import { query } from '../db/postgres/client';
import { normalizePhone, phoneDigits } from './phone';
import { EligibilityCheck } from '../types';
import { findUserByReferralCode } from './referralCode.service';
import { findCohortByCode, launchCohortFor } from './inviteCohorts.service';
import { isReviewPhone } from './reviewAccess';

const INVITE_ONLY_FLAG = 'invite_only';
// subscription_status values that count as an active paying/trialing subscriber.
const SUBSCRIBED_STATUSES = ['active', 'trialing'];
// The registering phone must already sit in the contact books of at least this
// many subscribers, OR this many users of any kind ("the bubble knows them").
// Lowered 3 → 2 on the founder's call (31 Aug, via Misho): the door and the
// Chorus target rule now say the same thing — held by two subscribers is
// enough to enter, and exactly the people Chorus invites. Env-adjustable so
// the founder can raise it back without a deploy.
const MIN_SUBSCRIBED_OWNERS = Number(process.env.SOCIAL_PROOF_MIN_SUBSCRIBED_OWNERS ?? 2);
const MIN_TOTAL_OWNERS = Number(process.env.SOCIAL_PROOF_MIN_TOTAL_OWNERS ?? 20);
// A full Georgian number in digits: '995' + the 9-digit local part.
const GEORGIA_CC = '995';
const GEORGIA_FULL_DIGITS = 12;

// Stored phones predate normalization and vary in spelling ('+995…', '995…',
// '599…', '0599…'). UserPhone lookups compare digits on both sides instead
// (see below) — this variant list exists only for the UserAlias social-proof
// probe, where a regexp on the column would forfeit the phone index over
// millions of rows. Every realistic spelling of the same number is enumerated
// so `phone = ANY(...)` stays index-friendly.
function phoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone.trim()]);
  const digits = phoneDigits(phone);
  if (digits) {
    variants.add(normalizePhone(phone));
    variants.add(digits);
    if (digits.startsWith(GEORGIA_CC) && digits.length === GEORGIA_FULL_DIGITS) {
      const local = digits.slice(GEORGIA_CC.length);
      variants.add(local);
      variants.add(`0${local}`);
    }
  }
  variants.delete('');
  return [...variants];
}

export async function isInviteOnlyEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [INVITE_ONLY_FLAG],
  );
  return result.rows[0]?.enabled === true;
}

// UserPhone holds one row per REGISTERED user — small enough that the
// format-independent digits comparison (no index) is free. Exact string
// matching here rejected real numbers whose stored spelling differed from the
// typed one, which locked the door on every registration (10 Aug).
async function isPhoneRegistered(phone: string): Promise<boolean> {
  const digits = phoneDigits(phone);
  if (!digits) return false;
  const result = await query<{ userId: number }>(
    `SELECT "userId" FROM "UserPhone"
     WHERE regexp_replace(phone, '\\D', '', 'g') = $1 LIMIT 1`,
    [digits],
  );
  return (result.rowCount ?? 0) > 0;
}

// A phonebook bigger than this is a purchased list, not a person's contacts —
// a 40k-row vendor dump imported under one account in 9 minutes must not
// vouch for every number it contains (ticket 4 blocker 4). Env-adjustable.
const MAX_HUMAN_PHONEBOOK_ROWS = Number(process.env.SOCIAL_PROOF_MAX_OWNER_CONTACTS ?? 15000);

// "The bubble knows them" = distinct HUMAN owners: live, non-deleted accounts
// whose own phonebook is human-sized. The per-owner size check is an
// index-only count over (contactId) and runs only for the handful of owners
// that actually carry the number.
async function passesSocialProof(variants: string[]): Promise<boolean> {
  const result = await query<{ total: string; subscribed: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE is_subscribed) AS subscribed
     FROM (
       SELECT ua."contactId",
              bool_or(u.subscription_status = ANY($2)) AS is_subscribed
       FROM "UserAlias" ua
       JOIN "User" u ON u.id = ua."contactId" AND u."deletedAt" IS NULL
       WHERE ua.phone = ANY($1)
       GROUP BY ua."contactId"
       HAVING (SELECT COUNT(*) FROM "UserAlias" b
               WHERE b."contactId" = ua."contactId") <= $3
     ) owners`,
    [variants, SUBSCRIBED_STATUSES, MAX_HUMAN_PHONEBOOK_ROWS],
  );
  const row = result.rows[0];
  const total = Number(row?.total ?? 0);
  const subscribed = Number(row?.subscribed ?? 0);
  return subscribed >= MIN_SUBSCRIBED_OWNERS || total >= MIN_TOTAL_OWNERS;
}

async function findSubscribedReferrer(referralPhone: string): Promise<number | null> {
  const digits = phoneDigits(referralPhone);
  if (!digits) return null;
  const result = await query<{ id: number }>(
    `SELECT u.id
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = $1
       AND u."deletedAt" IS NULL
       AND u.subscription_status = ANY($2)
     LIMIT 1`,
    [digits, SUBSCRIBED_STATUSES],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Attribution lookup for the referral-earnings chain: any registered,
 * non-deleted user counts as an inviter. Intentionally more lenient than the
 * gate's entrance rule (which demands a subscribed referrer) — with the gate
 * off, "invited by" is an optional field and an unknown phone must never
 * block or fail the registration, just go unattributed.
 */
async function findInviterForAttribution(
  referralPhone: string,
  registrantPhone: string,
): Promise<number | undefined> {
  // Self-referral guard: pointing the field at your own number attributes nothing.
  if (normalizePhone(referralPhone) === normalizePhone(registrantPhone)) return undefined;
  const digits = phoneDigits(referralPhone);
  if (!digits) return undefined;
  const result = await query<{ id: number }>(
    `SELECT u.id
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = $1 AND u."deletedAt" IS NULL
     LIMIT 1`,
    [digits],
  );
  return result.rows[0]?.id ?? undefined;
}

function hasReferralPhone(referralPhone?: string): referralPhone is string {
  return referralPhone !== undefined && referralPhone.trim() !== '';
}

/**
 * Invite-only gate for new registrations. Order matters:
 * an already-known phone (social proof) enters with no referral asked;
 * a referral from a subscribed user is the fallback for unknown phones.
 * Whatever the entrance mode, a provided referralPhone is resolved to an
 * inviter so the referral-earnings chain gets built even when the gate is
 * off or the person entered via social proof.
 */
export async function checkRegistrationEligibility(
  phone: string,
  referralPhone?: string,
  referralCode?: string,
): Promise<EligibilityCheck> {
  // A cohort code is an invitation from the company itself (Ticket 10 Task
  // 26, D125): it opens the door whatever the gate says, and carries its own
  // free period. Asked before the personal codes, because it outranks them.
  const cohort = referralCode?.trim() ? await findCohortByCode(referralCode) : null;

  // A referral CODE resolves first (founder decision, ticket 5 F.1: codes are
  // the invite currency; the phone path stays for backward compatibility).
  const codeOwner = referralCode?.trim() ? await findUserByReferralCode(referralCode) : null;
  const attribution =
    codeOwner?.userId ??
    (hasReferralPhone(referralPhone)
      ? await findInviterForAttribution(referralPhone, phone)
      : undefined);

  /**
   * Ticket 20 row 229 — WHY NOTHING HAS BEEN ATTRIBUTED SINCE 31 AUGUST, and
   * the honest answer is that nobody could tell, which is its own fault.
   *
   * The seat: Lika registered a new account through an invite link on
   * 21 September and `inviterReferralUserId` came out empty, so no reward can
   * be computed and neither side sees anything.
   *
   * Measured before touching anything: the last attributed registration in
   * this database is 31 AUGUST 14:36. Since then 25 real registrations and
   * ZERO attributed, while the link table recorded 12 issued, 5 sent and 29
   * OPENED. Links are being used and nothing that registers afterwards carries
   * an inviter.
   *
   * WHAT I CANNOT SEE FROM HERE is whether a code reaches this function at
   * all: the route accepts `referralCode`, this resolves it, and an
   * unresolvable or absent code falls through to `mode: 'open'` with no
   * inviter and no trace. So „the client never sent it" and „it arrived and
   * did not resolve" have looked identical for three weeks, and neither of
   * them leaves a line anywhere.
   *
   * This line ends that. No phone and no code text — a code is a credential
   * and belongs in a log no more than a number does (D149). Three booleans and
   * the mode are enough to tell the two cases apart on the next registration.
   */
  // eslint-disable-next-line no-console
  console.log(
    `[invite-gate] attribution: code_given=${Boolean(referralCode?.trim())} ` +
      `code_resolved=${codeOwner !== null} cohort=${cohort !== null} ` +
      `phone_given=${hasReferralPhone(referralPhone)} attributed=${attribution !== undefined}`,
  );

  /**
   * Row 229, the one defect I CAN see from here: this used to return before
   * `attribution` was computed, so a person who arrives with a cohort code AND
   * a friend's invitation lost the friend. The cohort still outranks the
   * personal code for the free period — that is D125 and it is unchanged —
   * but the inviter travels with them now. It is not the cause of the three
   * weeks (none of the 25 carries a cohort either) and it is a real hole on
   * the same line.
   */
  if (cohort) {
    return { eligible: true, mode: 'cohort', cohortCode: cohort.code, inviterUserId: attribution };
  }

  // D137 (8 Sep): a founder's own invitation inside the launch window carries
  // the launch cohort's free period — the attribution stays with the inviter.
  const launch = launchCohortFor(attribution);
  if (launch) {
    return { eligible: true, mode: 'cohort', cohortCode: launch.code, inviterUserId: attribution };
  }

  /**
   * A review or QA number is the company inviting itself.
   *
   * 17 September, Misho: „the test accounts do not work". The OTP bypass was
   * right and was never the wall — this was. `invite_only` is enabled on the
   * live base, so a number nobody has invited, with no cohort code and no
   * social proof, falls all the way through to `referral_required` and the
   * account is never created. The OTP check further down the registration
   * path never even runs.
   *
   * Asked BEFORE the invite-only flag rather than inside it, so the answer is
   * the same whether the door is open or shut — a test account that works only
   * while the gate happens to be off is a test account that will break on the
   * day it matters.
   *
   * Nothing is opened for anybody else: `reviewLoginDigits` returns an empty
   * set unless BOTH env vars are set, so with them unset this branch cannot
   * fire at all.
   */
  if (isReviewPhone(phone)) {
    return { eligible: true, mode: 'open', inviterUserId: attribution };
  }

  if (!(await isInviteOnlyEnabled())) {
    return { eligible: true, mode: 'open', inviterUserId: attribution };
  }

  if (await isPhoneRegistered(phone)) {
    return { eligible: true, mode: 'existing', inviterUserId: attribution };
  }

  if (await passesSocialProof(phoneVariants(phone))) {
    return { eligible: true, mode: 'social', inviterUserId: attribution };
  }

  if (codeOwner) {
    if (codeOwner.subscribed) {
      return { eligible: true, mode: 'referral', inviterUserId: codeOwner.userId };
    }
    return { eligible: false, reason: 'referrer_not_subscribed' };
  }

  if (hasReferralPhone(referralPhone)) {
    const inviterUserId = await findSubscribedReferrer(referralPhone);
    if (inviterUserId !== null) {
      return { eligible: true, mode: 'referral', inviterUserId };
    }
    return { eligible: false, reason: 'referrer_not_subscribed' };
  }

  return { eligible: false, reason: 'referral_required' };
}
