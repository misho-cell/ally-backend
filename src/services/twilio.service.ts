import { recordFixedUsage, resolveUserIdByPhone } from './costLedger.service';
import { redactPhones } from './toolCallLog.service';
import twilio from 'twilio';

let cachedClient: ReturnType<typeof twilio> | null = null;
let cachedVerifyServiceSid: string | null = null;

/**
 * ⚠️ 25 SEPTEMBER, AND THE FIRST REAL INVITATION THE FOUNDER EVER SENT.
 *
 * Valeri Chalabashvili has no WhatsApp. He opened the link, pressed „didn't
 * get the code — send via SMS", and read this on his screen:
 *
 *   authentication failed, account AC……… with status 4
 *   is not active
 *
 * Two separate faults in one line, and the product's own rules name both.
 *
 * 1. THE PROVIDER'S SENTENCE REACHED A USER, WITH OUR ACCOUNT ID IN IT.
 *    `/auth/resend-otp` answers with `error.message`, and nothing between the
 *    provider and that line rewrote it. „Never expose raw errors to the
 *    client" is in CLAUDE.md, and this is the same shape as a raw DB error —
 *    an internal identifier, in English, to a stranger at the door.
 *
 * 2. NOTHING WAS WRITTEN DOWN. Not one line in the container log, no row
 *    anywhere. `usage_events` records `otp_sms` only AFTER the send succeeds,
 *    so a total SMS outage and a quiet afternoon leave identical evidence —
 *    which is the fault this whole week has been about, in a new place. The
 *    first anybody knew was a person who could not get in.
 *
 * The provider account being inactive is a billing or suspension matter and
 * is the founder's or Misho's to settle. What is fixed here is that it can
 * never again be silent, and never again be quoted at the person locked out.
 */
const SMS_COULD_NOT_SEND =
  'SMS კოდი ვერ გაიგზავნა — ეს ჩვენი მხარის შეფერხებაა და არა შენი ნომრის პრობლემა. ' +
  'მიიღე კოდი WhatsApp-ით, ან სცადე ცოტა ხანში ხელახლა. თუ WhatsApp არ გაქვს და ' +
  'კოდი მაინც არ მოდის — მოგვწერე და ხელით შემოგიშვებთ.';

/**
 * An account SID is not a password, and it is still ours and not the reader's.
 * Kept as its last four so one log line can be pasted into a ticket without a
 * second thought — the same treatment D149 gives a phone number, and for the
 * same reason: a rule that depends on remembering is one that gets forgotten.
 */
function redactAccountSid(text: string): string {
  return text.replace(/\bAC[0-9a-f]{30,32}\b/gi, (sid) => `AC…${sid.slice(-4)}`);
}

/**
 * Safe to print anywhere: no token, no full account id, no full phone.
 *
 * THE ORDER IS NOT ARBITRARY and the first version had it backwards. An
 * account SID is „AC" and thirty-two hex characters, and its leading run of
 * digits looks exactly like a phone number to `PHONE_LIKE` — so redacting
 * phones first ate the middle of the SID, left the tail in place, and then the
 * SID pattern no longer matched what it was meant to catch. Caught by a test
 * asserting the last four rather than merely asserting the absence of the
 * whole thing: „it is not there" would have passed on a half-eaten id.
 *
 * The narrower pattern runs first. The general one cleans up after it.
 */
function safeProviderDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactPhones(redactAccountSid(raw)).slice(0, 300);
}

function getTwilioClient(): { client: ReturnType<typeof twilio>; verifyServiceSid: string } {
  if (cachedClient && cachedVerifyServiceSid) {
    return { client: cachedClient, verifyServiceSid: cachedVerifyServiceSid };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !verifyServiceSid) {
    throw new Error(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID must be set in environment variables',
    );
  }

  cachedClient = twilio(accountSid, authToken);
  cachedVerifyServiceSid = verifyServiceSid;

  return { client: cachedClient, verifyServiceSid };
}

/**
 * The one line an outage leaves behind, and it is deliberately shoutable:
 * `logs.sh logs <id> 400 "[otp-sms]"` is the whole diagnosis. It names the
 * provider's own code and status, because „the account is not active" and
 * „that number is unreachable" are different problems with different owners
 * and the count cannot tell them apart.
 */
function reportSmsFailure(error: unknown): void {
  const code = (error as { code?: unknown }).code;
  const status = (error as { status?: unknown }).status;
  // eslint-disable-next-line no-console
  console.error(
    `[otp-sms] PROVIDER REFUSED code=${String(code ?? '-')} status=${String(status ?? '-')}: ${safeProviderDetail(error)}`,
  );
}

export async function sendSmsOtp(phone: string): Promise<void> {
  try {
    const { client, verifyServiceSid } = getTwilioClient();
    await client.verify.v2.services(verifyServiceSid).verifications.create({
      to: phone,
      channel: 'sms',
    });
  } catch (error) {
    // The missing-configuration throw above is caught here too, on purpose: an
    // env var that was never set and a provider that refuses look the same to
    // the person at the door, and neither of them is their business.
    reportSmsFailure(error);
    throw new Error(SMS_COULD_NOT_SEND);
  }

  void resolveUserIdByPhone(phone)
    .then((userId) =>
      recordFixedUsage({ userId, kind: 'otp_sms', provider: 'twilio', priceKey: 'twilio.sms' }),
    )
    .catch(() => {});
}

export async function checkTwilioCode(phone: string, code: string): Promise<boolean> {
  try {
    const { client, verifyServiceSid } = getTwilioClient();
    const result = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phone, code });
    return result.status === 'approved';
  } catch (error) {
    /**
     * FALSE STAYS FALSE — a provider we cannot reach must never admit anybody.
     *
     * But „the code was wrong" and „the provider is down" were the same silent
     * false until today, which is the same conflation as `ok = false` meaning
     * both a refusal and a fault. The verdict does not move; the reason is
     * written down, so an outage cannot go on looking like a wall of people
     * mistyping.
     */
    reportSmsFailure(error);
    return false;
  }
}
