import twilio from 'twilio';

function getTwilioConfig(): { accountSid: string; authToken: string; verifyServiceSid: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !verifyServiceSid) {
    throw new Error(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID must be set in environment variables',
    );
  }

  return { accountSid, authToken, verifyServiceSid };
}

const { accountSid, authToken, verifyServiceSid: VERIFY_SERVICE_SID } = getTwilioConfig();
const client = twilio(accountSid, authToken);

export async function sendSmsOtp(phone: string, code: string): Promise<void> {
  await client.verify.v2.services(VERIFY_SERVICE_SID).verifications.create({
    to: phone,
    channel: 'sms',
    customCode: code,
  });
}
