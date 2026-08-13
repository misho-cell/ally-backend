import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID, randomInt, createHash } from 'crypto';
import { query } from '../db/postgres/client';
import { sendWhatsAppMessage } from './whatsapp.service';
import { sendSmsOtp, checkTwilioCode } from './twilio.service';
import { createUserPhoneNode } from './contacts.service';
import { checkRegistrationEligibility } from './inviteGate.service';
import { AuthPayload } from '../types';

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

export async function requestOTP(
  phone: string,
  actionType: 'REGISTER' | 'AUTH' | 'RECOVER',
): Promise<void> {
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

export async function registerUser(
  phone: string,
  name: string,
  referralPhone?: string,
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

  const gate = await checkRegistrationEligibility(phone, referralPhone);
  if (!gate.eligible) {
    // eslint-disable-next-line no-console
    console.warn(`[invite-gate] rejected registration ***${phone.slice(-4)} — ${gate.reason}`);
    throw new Error(
      gate.reason === 'referrer_not_subscribed'
        ? 'მოწვევის ნომერი ვერ მოიძებნა ან გამოწერა არ აქვს'
        : 'რეგისტრაციისთვის საჭიროა გამომწერი მეგობრის მოწვევა',
    );
  }

  // The OTP round-trip is mandatory: no verification record — no account.
  // (Consumed here, single use, so a stolen response can't be replayed.)
  if (!(await consumePhoneVerification(phone, ['REGISTER']))) {
    throw new Error(ERR_PHONE_NOT_VERIFIED);
  }

  const password = await bcrypt.hash(randomUUID(), SALT_ROUNDS);

  const userResult = await query<{ id: number }>(
    `INSERT INTO "User" (name, password, "hasAccessToAlly", "inviterReferralUserId", "createdAt", "updatedAt")
     VALUES ($1, $2, true, $3, NOW(), NOW())
     RETURNING id`,
    [name, password, gate.inviterUserId ?? null],
  );

  const userId = userResult.rows[0].id;
  // Store the phone canonically (no spaces/dashes) — unnormalized rows are what
  // broke is_member and self-exclusion for format-variant registrations.
  const cleanPhone = phone.replace(/[\s\-().]/g, '');
  const { phoneCode, phoneNumber } = parsePhone(cleanPhone);

  await query(
    `INSERT INTO "UserPhone" (phone, "phoneCode", "phoneNumber", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [cleanPhone, phoneCode, phoneNumber, userId],
  );

  await createUserPhoneNode(cleanPhone);

  const token = jwt.sign({ userId: String(userId), role: 'user' }, jwtSecret, { expiresIn: '30d' });
  return { token };
}

export async function completeLogin(phone: string): Promise<{ token: string; isNewUser: boolean }> {
  // Same format-independent compare as registration — a login with a different
  // phone format must find the EXISTING user, never mint a new one.
  const result = await query<{ id: number }>(
    `SELECT "userId" AS id FROM "UserPhone"
     WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')`,
    [phone],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { token: '', isNewUser: true };
  }

  // Same rule as registration: a session is only minted against a fresh,
  // consumed OTP verification (AUTH for login, RECOVER for account recovery).
  if (!(await consumePhoneVerification(phone, ['AUTH', 'RECOVER']))) {
    throw new Error(ERR_PHONE_NOT_VERIFIED);
  }

  const userId = result.rows[0].id;
  const token = jwt.sign({ userId: String(userId), role: 'user' }, jwtSecret, { expiresIn: '30d' });
  return { token, isNewUser: false };
}

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
    expiresIn: '8h',
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
