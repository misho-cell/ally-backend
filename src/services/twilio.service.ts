import twilio from 'twilio';

let cachedClient: ReturnType<typeof twilio> | null = null;
let cachedVerifyServiceSid: string | null = null;

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

export async function sendSmsOtp(phone: string): Promise<void> {
  const { client, verifyServiceSid } = getTwilioClient();
  await client.verify.v2.services(verifyServiceSid).verifications.create({
    to: phone,
    channel: 'sms',
  });
}

export async function checkTwilioCode(phone: string, code: string): Promise<boolean> {
  try {
    const { client, verifyServiceSid } = getTwilioClient();
    const result = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phone, code });
    return result.status === 'approved';
  } catch {
    return false;
  }
}
