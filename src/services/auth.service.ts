import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID, randomInt, createHash } from 'crypto';
import { query } from '../db/postgres/client';
import { sendWhatsAppMessage } from './whatsapp.service';
import { sendSmsOtp, checkTwilioCode } from './twilio.service';
import { createUserPhoneNode } from './contacts.service';
import { runWelcomeStudy } from './welcomeStudy.service';
import { checkRegistrationEligibility, isLoginInviteOnlyEnabled } from './inviteGate.service';
import { isReviewPhone } from './reviewAccess';
import {
  findCohortByCode,
  grantCohortTrial,
  launchCohortFor,
  LAUNCH_COHORT_CODE,
} from './inviteCohorts.service';
import { inviteFreeDays, inviteFreeDaysCohort } from './inviteReward.service';
import { attributeCampaignJoin } from './chorusCampaign.service';
import { AuthPayload, EligibilityCheck } from '../types';
import { normalizePhone } from './phone';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) {
  throw new Error('JWT_SECRET must be set in environment variables');
}

const SALT_ROUNDS = 12;
// How long a completed OTP verification stays valid for register/complete-login.
const VERIFICATION_TTL_MINUTES = 10;
// Per-PHONE send ceiling (per-IP and per-device limits live in the router; this
// closes the "many senders, one victim phone" hole).
const OTP_SENDS_PER_PHONE_PER_HOUR = 5;
// Names WHOSE number and WHAT to do: the old wording ("ნომერი
// დაუდასტურებელია") sat on a screen with TWO numbers — the registrant's and
// the inviter's — and named neither, on a step with no visible code field
// (ticket 4 item 5.2: the most experienced tester asked "maybe it's my
// fault"). The inviter's number never needs verifying; only the registrant's
// own does, via the OTP step.
/**
 * ROW 229's GATE — what somebody sees when Netai will not let them in.
 *
 * Founder's rule, 24 September: „nobody, except people who are already on
 * netai, can join netai without invitation". This is the sentence a person
 * reads when that applies to them, and it has to do two things a generic
 * failure cannot: say that nothing is broken, and say what would work. A
 * person refused without a reason tries again, then concludes the product is
 * broken and tells somebody so.
 */
const ERR_INVITATION_REQUIRED =
  'Netai-ში შესვლა მოწვევით ხდება. გთხოვე ვინმეს, ვინც უკვე იყენებს Netai-ს, ' +
  'გამოგიგზავნოს მოსაწვევი ბმული ან კოდი — შენი ანგარიში ადგილზეა და ' +
  'მოწვევის შემდეგ პირდაპირ შემოხვალ.';

const ERR_PHONE_NOT_VERIFIED =
  'შენი ნომერი ჯერ დადასტურებული არ არის: ჯერ შენს ნომერზე გამოგზავნილი კოდი შეიყვანე და მერე ' +
  'გააგრძელე. (მომწვევის ნომერს დადასტურება არ სჭირდება.)';

// An authentication secret must come from a CSPRNG — Math.random() is guessable.
function generateOTP(): string {
  return randomInt(100000, 1000000).toString();
}

// Codes are stored hashed: a DB read must never yield a usable login code.
function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function enforcePhoneSendCap(phone: string): Promise<void> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM otp_sends
     WHERE phone_digits = $1 AND sent_at > NOW() - INTERVAL '1 hour'`,
    [phoneDigits(phone)],
  );
  if (Number(result.rows[0]?.count ?? 0) >= OTP_SENDS_PER_PHONE_PER_HOUR) {
    throw new Error('ამ ნომერზე ძალიან ბევრი კოდი გაიგზავნა — სცადე ერთ საათში');
  }
}

async function recordOtpSend(phone: string): Promise<void> {
  await query(`INSERT INTO otp_sends (phone_digits) VALUES ($1)`, [phoneDigits(phone)]);
}

// One successful OTP check = one short-lived verification, consumed exactly
// once by register/complete-login. This is what makes the OTP mandatory
// server-side instead of a client-flow convention.
async function markPhoneVerified(phone: string, actionType: string): Promise<void> {
  await query(
    `INSERT INTO phone_verifications (phone_digits, action_type, verified_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone_digits, action_type) DO UPDATE SET verified_at = NOW()`,
    [phoneDigits(phone), actionType],
  );
}

async function consumePhoneVerification(phone: string, actionTypes: string[]): Promise<boolean> {
  const result = await query(
    `DELETE FROM phone_verifications
     WHERE phone_digits = $1
       AND action_type = ANY($2)
       AND verified_at > NOW() - INTERVAL '${VERIFICATION_TTL_MINUTES} minutes'`,
    [phoneDigits(phone), actionTypes],
  );
  return (result.rowCount ?? 0) > 0;
}

function parsePhone(e164: string): { phoneCode: string; phoneNumber: string } {
  if (!e164.startsWith('+')) {
    throw new Error('ტელეფონი E.164 ფორმატში უნდა იყოს (+...)');
  }
  if (e164.startsWith('+995')) return { phoneCode: '+995', phoneNumber: e164.slice(4) };
  if (e164.startsWith('+1') && e164.length === 12)
    return { phoneCode: '+1', phoneNumber: e164.slice(2) };
  if (e164.startsWith('+7')) return { phoneCode: '+7', phoneNumber: e164.slice(2) };
  if (e164.startsWith('+44')) return { phoneCode: '+44', phoneNumber: e164.slice(3) };
  if (e164.startsWith('+49')) return { phoneCode: '+49', phoneNumber: e164.slice(3) };
  // Generic: assume 3-digit country code
  return { phoneCode: e164.slice(0, 4), phoneNumber: e164.slice(4) };
}

// --- Store/marketplace review login ------------------------------------------
// The list itself lives in reviewAccess.ts, because the INVITE GATE has to read
// the same one: a review number that cannot get past the gate cannot register,
// whatever the OTP does. That was the whole of „the test accounts do not work"
// on 17 September.
function isReviewLogin(phone: string, code: string): boolean {
  return isReviewPhone(phone) && code === process.env.REVIEW_OTP;
}

// Long enough to outlive any review or testing window; the accounts stop
// working anyway once REVIEW_PHONE is unset, because nobody can log into them.
const REVIEW_SUBSCRIPTION_DAYS = 365;

export async function requestOTP(
  phone: string,
  actionType: 'REGISTER' | 'AUTH' | 'RECOVER',
): Promise<void> {
  // The review number gets no message and no stored code — verifyOTP accepts
  // its fixed env code instead.
  if (isReviewPhone(phone)) return;

  await enforcePhoneSendCap(phone);

  const code = generateOTP();

  // One valid code at a time: a new request invalidates every earlier code for
  // this phone+action (format-independent, so a re-request in another format
  // can't leave a second live code behind).
  await query(
    `DELETE FROM "Otp"
     WHERE regexp_replace(identifier, '\\D', '', 'g') = $1
       AND "actionType" = $2::"ActionType"
       AND "identifierType" = 'PHONE'::"IdentifierType"`,
    [phoneDigits(phone), actionType],
  );

  await query(
    `INSERT INTO "Otp" (identifier, "identifierType", "actionType", otp, "createdAt", "updatedAt")
     VALUES ($1, 'PHONE'::"IdentifierType", $2::"ActionType", $3, NOW(), NOW())`,
    [phone, actionType, hashOtp(code)],
  );

  await recordOtpSend(phone);
  await sendWhatsAppMessage(phone, code);
}

const RESEND_COOLDOWN_SECONDS = 30;

export async function resendOTP(
  phone: string,
  actionType: 'REGISTER' | 'AUTH' | 'RECOVER',
): Promise<void> {
  if (isReviewPhone(phone)) return;

  const result = await query<{ createdAt: Date }>(
    `SELECT "createdAt" FROM "Otp"
     WHERE identifier = $1
       AND "actionType" = $2::"ActionType"
       AND "identifierType" = 'PHONE'::"IdentifierType"
       AND "createdAt" > NOW() - INTERVAL '5 minutes'
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [phone, actionType],
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('OTP არ მოიძებნა. ჯერ კოდი მოითხოვეთ');
  }

  const { createdAt } = result.rows[0];
  const secondsElapsed = (Date.now() - new Date(createdAt).getTime()) / 1000;

  if (secondsElapsed < RESEND_COOLDOWN_SECONDS) {
    throw new Error(`გთხოვთ, ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsElapsed)} წამი დაიცადოთ`);
  }

  await enforcePhoneSendCap(phone);
  await recordOtpSend(phone);
  await sendSmsOtp(phone);
}

export async function verifyOTP(
  phone: string,
  code: string,
  actionType: 'REGISTER' | 'AUTH' | 'RECOVER',
): Promise<void> {
  // Review login: the fixed env code verifies the designated number with no
  // stored OTP. A wrong code on that number still falls through and fails.
  if (isReviewLogin(phone, code)) {
    await markPhoneVerified(phone, actionType);
    return;
  }

  // Codes are stored hashed; compare hashes. Consumed on use (single-shot).
  const result = await query<{ id: number }>(
    `SELECT id FROM "Otp"
     WHERE regexp_replace(identifier, '\\D', '', 'g') = $1
       AND otp = $2
       AND "actionType" = $3::"ActionType"
       AND "identifierType" = 'PHONE'::"IdentifierType"
       AND "createdAt" > NOW() - INTERVAL '5 minutes'`,
    [phoneDigits(phone), hashOtp(code), actionType],
  );

  if (result.rowCount && result.rowCount > 0) {
    await query('DELETE FROM "Otp" WHERE id = $1', [result.rows[0].id]);
    await markPhoneVerified(phone, actionType);
    return;
  }

  const twilioVerified = await checkTwilioCode(phone, code);
  if (twilioVerified) {
    await query(
      `DELETE FROM "Otp"
       WHERE regexp_replace(identifier, '\\D', '', 'g') = $1
         AND "actionType" = $2::"ActionType"
         AND "identifierType" = 'PHONE'::"IdentifierType"`,
      [phoneDigits(phone), actionType],
    );
    await markPhoneVerified(phone, actionType);
    return;
  }

  throw new Error('კოდი არასწორია ან ვადა გასულია');
}

/**
 * Whatever free period this brand-new account is owed, granted once.
 *
 * TWO SOURCES, IN ORDER, AND NEVER BOTH:
 *
 *  1. A COHORT CODE (Ticket 10 Task 26, D125) opens the account already
 *     trialing for the cohort's own number of days, no card asked. The cohort
 *     is re-read here rather than trusted from the gate result: the door may
 *     have been closed between the eligibility check and this write.
 *
 *  2. FAILING THAT, AN ORDINARY INVITATION (D485, 24 Sep): „it has to be
 *     switchable and at first we will set it on 20 days (from dashboard) and
 *     then reduce those days to 10 or five." Off unless the switch is on and
 *     the number is written — see `inviteReward.service`.
 *
 * The order is not a preference, it is arithmetic: both write the same columns,
 * so running the second after the first would overwrite a cohort's period with
 * the general one and quietly shorten what somebody was promised. A person who
 * came through a cohort door has already been given days; this adds nothing.
 */
/**
 * HAS THIS ACCOUNT EVER USED NETAI — the login gate's condition, written once.
 *
 * ⚠️ IT IS A FRAGMENT AND NOT A FUNCTION FOR ONE REASON: `completeLogin` asks
 * it in the SAME round trip as the phone lookup, and the admin dry-run asks it
 * of an account id. A second copy of the condition is how the gate and the
 * thing that checks the gate end up disagreeing — and a checker that carries
 * its own copy of the rule will agree with itself whatever the rule does.
 *
 * ANY sign of use, not one sign. It read „has a thread" until a dry run on 24
 * September found account 4511: no thread, and a live push subscription
 * registered 21 September with two notifications sent to it. A push
 * subscription cannot exist unless that browser was on the Netai site and the
 * person granted permission, so the gate would have told somebody they need an
 * invitation to a product they already have on their phone.
 *
 * OR and not AND: AND would refuse everybody who has a thread but never turned
 * notifications on, which is 40 of the 45 people who have used Netai.
 */
/**
 * ⚠️ AND THE ONLY THINGS IT MAY BE GIVEN ARE LISTED HERE.
 *
 * This builds SQL by interpolation, which the house rule forbids — for user
 * data, and rightly. What goes in is a COLUMN EXPRESSION or a placeholder, and
 * neither can be a bind parameter: `$1` cannot name a column. So the safety has
 * to come from somewhere else, and „only ever called with a literal" is a
 * promise, not a guarantee. The allow-list makes it one.
 */
const ID_EXPRESSIONS = ['up."userId"', '$1::int'] as const;

export function hasUsedNetaiSql(idExpr: (typeof ID_EXPRESSIONS)[number]): string {
  if (!ID_EXPRESSIONS.includes(idExpr)) {
    throw new Error('hasUsedNetaiSql: unknown id expression');
  }
  return `(EXISTS (SELECT 1 FROM threads t WHERE t.user_id = ${idExpr})
           OR EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = ${idExpr}))`;
}

/**
 * WHAT THE LOGIN GATE WOULD DO TO THIS ACCOUNT, WITHOUT LOGGING ANYBODY IN.
 *
 * The tester, 24 September, minutes after the gate went on: „Real login: we
 * cannot. It needs a login code and this seat never types one." True, and it
 * is the same wall the registration gate hit — a switch that refuses people
 * with no way to see the refusal is a switch nobody can check.
 *
 * It asks the SAME condition `completeLogin` asks, through the same fragment,
 * and the same flag. Nothing is written and no session is minted: the OTP is
 * the thing that makes a login a login, and it is not consulted here.
 */
export interface LoginGateVerdict {
  readonly account_exists: boolean;
  readonly gate_on: boolean;
  readonly has_used_netai: boolean;
  readonly would_be_admitted: boolean;
  readonly reason: string;
}

export async function loginGateVerdict(userId: number): Promise<LoginGateVerdict> {
  const found = await query<{ has_used_netai: boolean }>(
    `SELECT ${hasUsedNetaiSql('$1::int')} AS has_used_netai
       FROM "User" u WHERE u.id = $1::int AND u."deletedAt" IS NULL`,
    [userId],
  );
  const gateOn = await isLoginInviteOnlyEnabled();

  if (found.rowCount === 0) {
    return {
      account_exists: false,
      gate_on: gateOn,
      has_used_netai: false,
      would_be_admitted: false,
      reason: 'no such account — a login would be treated as a new registration instead',
    };
  }

  const hasUsed = found.rows[0].has_used_netai === true;
  if (hasUsed) {
    return {
      account_exists: true,
      gate_on: gateOn,
      has_used_netai: true,
      would_be_admitted: true,
      reason: 'has used Netai — a thread or a push subscription; the gate never sees this account',
    };
  }
  return {
    account_exists: true,
    gate_on: gateOn,
    has_used_netai: false,
    would_be_admitted: !gateOn,
    reason: gateOn
      ? 'REFUSED: no Netai activity and the invitation gate is on'
      : 'no Netai activity, but the gate is off — admitted, and a first-arrival line is logged',
  };
}

export async function grantWhateverFreePeriodIsOwed(
  userId: number,
  cleanPhone: string,
  gate: EligibilityCheck,
): Promise<void> {
  if (gate.mode === 'cohort' && gate.cohortCode) {
    const cohort =
      gate.cohortCode === LAUNCH_COHORT_CODE
        ? launchCohortFor(gate.inviterUserId)
        : await findCohortByCode(gate.cohortCode);
    if (cohort) {
      await grantCohortTrial(userId, cleanPhone, cohort);
      return;
    }
  }

  // An invitation means somebody brought them: an inviter was resolved. Social
  // proof — a phone already in somebody's contacts, nobody inviting — is NOT an
  // invitation, and giving it free days would hand the product away to a door
  // the founder is in the middle of closing.
  if (gate.inviterUserId === undefined) return;

  const days = await inviteFreeDays();
  if (days === null) return;
  await grantCohortTrial(userId, cleanPhone, inviteFreeDaysCohort(days));
}

export async function registerUser(
  phone: string,
  name: string,
  referralPhone?: string,
  referralCode?: string,
): Promise<{ token: string }> {
  // Format-independent lookup: "+995 599…", "995599…" and the stored form must
  // all hit the same row. An exact string compare here created a DUPLICATE user
  // on re-login when the client sent a different format — the old account (and
  // its chats/network) silently "disappeared" for the user.
  const existing = await query<{ id: number }>(
    `SELECT id FROM "UserPhone"
     WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')`,
    [phone],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    throw new Error('ნომერი უკვე რეგისტრირებულია');
  }

  const gate = await checkRegistrationEligibility(phone, referralPhone, referralCode);
  if (!gate.eligible) {
    // eslint-disable-next-line no-console
    console.warn(`[invite-gate] rejected registration ***${phone.slice(-4)} — ${gate.reason}`);
    throw new Error(
      gate.reason === 'referrer_not_subscribed'
        ? 'მოწვევის ნომერი ვერ მოიძებნა ან გამოწერა არ აქვს'
        : 'რეგისტრაციისთვის საჭიროა გამომწერი მეგობრის მოწვევა',
    );
  }

  // Everything that can fail on INPUT is validated BEFORE the verification is
  // consumed: a burnt verification on a failed attempt sent the retry to
  // "ნომერი დადასტურებული არ არის" even though the person had just passed the
  // OTP (13 Aug: a real new user bounced back to the invite screen after
  // completing every step). normalizePhone also accepts the local "5XX…" form
  // the registration screen shows as its placeholder — the raw value used to
  // reach parsePhone and throw on the missing "+".
  const cleanPhone = normalizePhone(phone);
  const { phoneCode, phoneNumber } = parsePhone(cleanPhone);

  // The OTP round-trip is mandatory: no verification record — no account.
  // Consumed here, single use, so a stolen response can't be replayed.
  // REGISTER and AUTH are both accepted: they prove the same thing (possession
  // of this phone within the TTL), and the app's single entry screen sends the
  // code as AUTH before it knows whether the number is new — demanding
  // REGISTER-only rejected every real new user who arrived through login.
  if (!(await consumePhoneVerification(phone, ['REGISTER', 'AUTH']))) {
    throw new Error(ERR_PHONE_NOT_VERIFIED);
  }

  try {
    const password = await bcrypt.hash(randomUUID(), SALT_ROUNDS);

    const userResult = await query<{ id: number }>(
      `INSERT INTO "User" (name, password, "hasAccessToAlly", "inviterReferralUserId", "createdAt", "updatedAt")
       VALUES ($1, $2, true, $3, NOW(), NOW())
       RETURNING id`,
      // Trimmed at the door: a trailing space in a stored name renders as
      // "**Name **" on every recipient's phone (three accounts carried one —
      // ticket 8 task 12; migration 099 cleans the stock).
      [name.trim(), password, gate.inviterUserId ?? null],
    );

    const userId = userResult.rows[0].id;
    await query(
      `INSERT INTO "UserPhone" (phone, "phoneCode", "phoneNumber", "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [cleanPhone, phoneCode, phoneNumber, userId],
    );

    // Review/test numbers get a working subscription at the door: the whole
    // point of those accounts is to exercise the full product, and every
    // feature past login sits behind requireSubscription. Same lifecycle as
    // the OTP bypass — gone the moment REVIEW_PHONE is unset.
    if (isReviewPhone(phone)) {
      await query(
        `UPDATE "User"
         SET subscription_status = 'active', subscription_tier = 'pro',
             current_period_ends_at = NOW() + make_interval(days => $2)
         WHERE id = $1`,
        [userId, REVIEW_SUBSCRIPTION_DAYS],
      );
    }

    await grantWhateverFreePeriodIsOwed(userId, cleanPhone, gate);

    await createUserPhoneNode(cleanPhone);

    // Engine T13: fire-and-forget, never blocks the registration response.
    void runWelcomeStudy(String(userId), name, cleanPhone).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(`[welcome-study] user ${userId} failed to start:`, (err as Error).message),
    );

    // Engine T8: the moment T3's own attribution (inviterUserId) lands on a
    // real registration — did it complete a live Chorus campaign?
    void attributeCampaignJoin(cleanPhone, gate.inviterUserId ?? null).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(
        `[chorus] campaign attribution failed for user ${userId}:`,
        (err as Error).message,
      ),
    );

    const token = jwt.sign({ userId: String(userId), role: 'user' }, jwtSecret, {
      expiresIn: '30d',
    });
    return { token };
  } catch (err) {
    // The creation failed AFTER the verification was spent — hand it back so
    // the user's retry works instead of demanding a code they already entered.
    await markPhoneVerified(phone, 'REGISTER').catch(() => undefined);
    throw err;
  }
}

export async function completeLogin(phone: string): Promise<{ token: string; isNewUser: boolean }> {
  // Same format-independent compare as registration — a login with a different
  // phone format must find the EXISTING user, never mint a new one.
  /**
   * THE SECOND COLUMN IS ROW 229's BLIND SPOT, AND IT COSTS NOTHING TO READ.
   *
   * 62,163 legacy Ally accounts hold a phone number. When one of those people
   * clicks an invite link, `registerUser` REFUSES them — „this number is
   * already registered" — and they arrive here instead, where a session is
   * minted and no inviter is recorded, because this route does not accept a
   * referral code and this function takes one argument.
   *
   * It is not theoretical: of the 45 people who have used Netai, 35 never
   * registered. They came through this door.
   *
   * WHETHER LOGIN SHOULD CARRY AN INVITER IS NOT MINE — it needs the founder
   * (does an existing Ally user earn somebody a referral; does a link clicked
   * today still count in six weeks). **But the event being INVISIBLE is mine**,
   * and it is the same fault as everything else found today: a thing happens,
   * nothing says so, and the absence reads as „it did not happen".
   *
   * So the query answers one more question — has this account ever used Netai
   * — in the same round trip, and a first arrival writes a line. No phone
   * number in it (D149): the account id is the handle, and it is enough to
   * read the row back.
   */
  const result = await query<{ id: number; has_used_netai: boolean }>(
    /**
     * ⚠️ ANY SIGN OF USE, NOT ONE SIGN — and it took a dry run to find that out.
     *
     * This asked only „has a thread", and §34 said that split the population
     * cleanly because an account with messages or goals but no thread does not
     * exist — zero, and zero, both checked, both still true. **Push
     * subscriptions were not among the things checked.**
     *
     * Run as a read against every account on 24 September, before the gate was
     * ever switched on: 62,173 would be refused, and one of them — account
     * 4511, an old Ally account from 2024 — has a live push subscription,
     * registered 21 September, two notifications sent to it. A push
     * subscription cannot exist unless that browser was on the Netai site and
     * the person granted permission. So that is somebody who has opened the
     * product and put it on their phone, and the gate would have told them
     * they need an invitation to something they already have installed.
     *
     * Widening it admits ONE more person and refuses nobody extra, which is
     * the direction a gate that turns people away has to fail in. If the
     * founder decides that account should be refused after all, this comes
     * back out — but that is a decision somebody makes, not a gap nobody saw.
     */
    `SELECT up."userId" AS id,
            ${hasUsedNetaiSql('up."userId"')} AS has_used_netai
       FROM "UserPhone" up
      WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')`,
    [phone],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { token: '', isNewUser: true };
  }

  // Same rule as registration: a session is only minted against a fresh,
  // consumed OTP verification. All three action types prove the same thing —
  // possession of this phone within the TTL — so none of them may strand a
  // real person on the wrong screen (the register/login mirror of the 13 Aug
  // registration bounce).
  if (!(await consumePhoneVerification(phone, ['AUTH', 'RECOVER', 'REGISTER']))) {
    throw new Error(ERR_PHONE_NOT_VERIFIED);
  }

  const userId = result.rows[0].id;
  if (!result.rows[0].has_used_netai) {
    /**
     * THE GATE. Registered as §34 of `ADMIN_WRITE_OPERATIONS.md` BEFORE it was
     * written, because it refuses real people entry to the product and the way
     * to switch it off has to exist before the thing it switches off.
     *
     * IT SHIPS OFF. `netai_invite_only_login` defaults to false and turning it
     * back off is one UPDATE — the gate writes nothing, so there is no state
     * to restore afterwards.
     *
     * ⚠️ THE CONDITION IS „HAS NEVER OPENED NETAI", NOT THE FLAG, and the
     * difference is the whole safety of this:
     *
     *     hasAccessToAlly = false, never opened Netai    62,163   the target
     *     hasAccessToAlly = false, USES NETAI TODAY          35   Lika among them
     *
     * `hasAccessToAlly` is the ADMIN-LOGIN flag. Keying on it would refuse the
     * second most active person in the product at her next login and tell her
     * she needs an invitation to something she has used for weeks. `has_used_netai`
     * is read from `threads` two lines above, and there is no account anywhere
     * with messages or goals but no thread — so the two groups separate cleanly.
     */
    if (await isLoginInviteOnlyEnabled()) {
      // eslint-disable-next-line no-console
      console.log(
        `[login] account ${userId} REFUSED: no Netai activity and the invitation gate is on`,
      );
      throw new Error(ERR_INVITATION_REQUIRED);
    }
    // An account that existed before tonight, opening Netai for the first
    // time. If somebody invited them, that invitation cannot be credited by
    // this route — see the comment above — so at minimum it must be readable.
    // eslint-disable-next-line no-console
    console.log(
      `[login] account ${userId} opened Netai for the first time — existing account, ` +
        'so no inviter can have been recorded on this path (row 229)',
    );
  }
  const token = jwt.sign({ userId: String(userId), role: 'user' }, jwtSecret, { expiresIn: '30d' });
  return { token, isNewUser: false };
}

/**
 * How long an admin session lasts. Raised from 8h to 12h on 19 September, on
 * Misho's ask.
 *
 * WHAT IT BUYS: a working day is longer than eight hours here, and an admin
 * re-authenticating mid-afternoon is a person interrupted in the middle of
 * something — today that meant the tester's seat being signed out of a test
 * account and the whole acceptance run waiting on somebody to type a code.
 *
 * WHAT IT COSTS, because it is a security parameter and the cost should be
 * written next to the number: a stolen admin token is usable for twelve hours
 * instead of eight. There is no refresh and no revocation list — the only way
 * to invalidate an issued token before it expires is to rotate the JWT secret,
 * which signs out every user as well. So the TTL IS the blast radius, and 12h
 * is the point where „long enough for a day" meets „short enough to sleep on".
 * It is a constant rather than an env var on purpose: this number should be
 * read in a diff, not changed quietly in a dashboard.
 */
const ADMIN_TOKEN_TTL = '12h';

export async function adminLogin(email: string, password: string): Promise<{ token: string }> {
  const result = await query<{ id: number; password: string; hasAccessToAlly: boolean }>(
    'SELECT id, password, "hasAccessToAlly" FROM "User" WHERE email = $1 AND "deletedAt" IS NULL',
    [email],
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('მომხმარებელი ვერ მოიძებნა');
  }

  const user = result.rows[0];

  if (!user.hasAccessToAlly) {
    throw new Error('წვდომა დაკავებულია');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('არასწორი პაროლი');
  }

  const token = jwt.sign({ userId: String(user.id), role: 'admin' }, jwtSecret, {
    expiresIn: ADMIN_TOKEN_TTL,
  });
  return { token };
}

export function verifyToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, jwtSecret);

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('userId' in decoded) ||
    !('role' in decoded)
  ) {
    throw new Error('Invalid authentication token');
  }

  return {
    userId: String((decoded as Record<string, unknown>).userId),
    role: (decoded as Record<string, unknown>).role as 'user' | 'admin',
  };
}
