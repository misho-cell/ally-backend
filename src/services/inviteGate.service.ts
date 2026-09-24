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

/**
 * ROW 229's LOGIN GATE, its own switch, DEFAULT OFF.
 *
 * Deliberately NOT the same flag as `invite_only`. That one governs
 * REGISTRATION and has been true on the live base since 17 September; reusing
 * it would have turned the login gate on the moment it deployed, at 62,163
 * people, with nobody having tested it. Two different doors, two switches, and
 * the new one starts shut.
 *
 * A missing row reads false, so the gate is off until somebody writes it —
 * which is the right direction for a flag that refuses people entry.
 */
const LOGIN_INVITE_ONLY_FLAG = 'netai_invite_only_login';

/**
 * „ONLY A PERSON'S OWN CODE" — the founder, 24 September, twice and explicitly.
 *
 * On company codes: „no, because I will be one who invites them. me or our team
 * members. so no one can invite them, except of team members."
 *
 * On social proof, asked with the consequence in the question — about 465
 * people can currently join with nobody inviting them, should that close:
 * „yes, correct."
 *
 * So when this is on, three doors shut: the company cohort codes, the launch
 * cohort, and social proof. What remains is a member's own referral code, and
 * login for people already using Netai.
 *
 * ⚠️ AND ONE DOOR ON THE LIST IS DELIBERATELY NOT SHUT — see `isReviewPhone`
 * below. A store reviewer is not somebody joining Netai.
 *
 * DEFAULT OFF, like the login gate and for the same reason: closing a door
 * stops real people getting in, and a closure nobody has tested is not a
 * decision carried out, it is a decision gambled on.
 */
const PERSONAL_CODE_ONLY_FLAG = 'invite_personal_code_only';

export async function isPersonalCodeOnlyEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [PERSONAL_CODE_ONLY_FLAG],
  );
  return result.rows[0]?.enabled === true;
}

export async function isLoginInviteOnlyEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [LOGIN_INVITE_ONLY_FLAG],
  );
  return result.rows[0]?.enabled === true;
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
  /**
   * READ LAZILY, AND THE TEST THAT FORCED THAT WAS RIGHT TO EXIST.
   *
   * The first version read this flag at the top of the function. A test
   * asserting „when the gate is off this makes exactly ONE query" went red,
   * because every registration attempt now paid for a second flag read it
   * almost never needed — the commonest path returns before any of the three
   * doors below is reached.
   *
   * So it is read only when a door is actually about to open because of it,
   * and memoised so two doors cannot cost two queries.
   */
  let personalOnly: boolean | null = null;
  const personalCodeOnly = async (): Promise<boolean> => {
    if (personalOnly === null) personalOnly = await isPersonalCodeOnlyEnabled();
    return personalOnly;
  };

  // A COMPANY CODE IS NOT A PERSON INVITING SOMEBODY. The founder's own words:
  // he and the team will invite people with THEIR OWN codes, so a cohort code
  // stops being a way in — including the free period it used to carry (D125).
  if (cohort && !(await personalCodeOnly())) {
    return { eligible: true, mode: 'cohort', cohortCode: cohort.code, inviterUserId: attribution };
  }

  // D137 (8 Sep): a founder's own invitation inside the launch window carries
  // the launch cohort's free period — the attribution stays with the inviter.
  /**
   * ⚠️ NOT CLOSED BY „only a person's own code", AND I HAD CLOSED IT — wrongly,
   * for about forty minutes, on a relayed list that named it as a company door.
   *
   * IT IS NOT A DOOR. `launchCohortFor` returns null unless there is an
   * INVITER, and unless that inviter is one of the founder's own named
   * accounts, inside the launch window. Its name in the code is „Axel launch
   * window (the founders' own invitations)".
   *
   * So it never admits anybody who was not personally invited. What it carries
   * is the TWENTY FREE DAYS (D137) — the reward attached to those invitations.
   *
   * Closing it would therefore have left the person getting IN on a member's
   * code, exactly as the founder wants, and silently WITHOUT the twenty days
   * he said they should get. The rule and the reward would have contradicted
   * each other, at the Axel launch, which is the event this exists for.
   *
   * I refused to close social proof on an inference and then closed this one
   * without asking what it did. The lesson is not „be more careful with
   * lists": it is that a door and a reward can wear the same word, and the
   * only way to tell is to read what the thing actually does.
   */
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
  /**
   * ⚠️ NOT CLOSED BY „only a person's own code", DELIBERATELY, AND THIS IS THE
   * ONE PLACE I DID NOT DO WHAT THE LIST SAID.
   *
   * The relayed list of doors to shut included the review/QA numbers. The
   * founder's words were about who may INVITE somebody; a store reviewer is not
   * somebody joining Netai, it is the company testing its own app. Paddle and
   * the app stores cannot receive a Georgian SMS, and this list is the only way
   * they get in.
   *
   * Closing it would re-create the exact fault Misho reported on 17 September —
   * „the test accounts do not work" — which was this gate refusing the review
   * numbers before the OTP was even looked at. A week later it would come back
   * as an app-store review failing.
   *
   * It is also already off by default: `reviewLoginDigits()` returns an empty
   * set unless BOTH environment variables are set, so this branch cannot fire
   * on an ordinary day. If the founder wants it shut too, it is one line — but
   * that is a sentence he should say about reviewers, not one inferred from a
   * sentence about invitations.
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

  // SOCIAL PROOF LET SOMEBODY IN BECAUSE OTHER PEOPLE HAD THEIR NUMBER SAVED —
  // nobody invited them. Roughly 465 numbers qualified on 24 September, and the
  // founder was asked with that number in the question before he answered.
  if (!(await personalCodeOnly()) && (await passesSocialProof(phoneVariants(phone)))) {
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
