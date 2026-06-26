import twilio from 'twilio';

function getTwilioConfig(): { accountSid: string; authToken: string; phoneNumber: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set in environment variables',
    );
  }

  return { accountSid, authToken, phoneNumber };
}

const { accountSid, authToken, phoneNumber: TWILIO_FROM } = getTwilioConfig();
const client = twilio(accountSid, authToken);

export async function sendSmsOtp(phone: string, code: string): Promise<void> {
  await client.messages.create({
    body: `Ally-ს შესასვლელი კოდი: ${code}`,
    from: TWILIO_FROM,
    to: phone,
  });
}
