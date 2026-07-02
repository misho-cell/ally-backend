import { recordFixedUsage, resolveUserIdByPhone } from './costLedger.service';

const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

if (!WHATSAPP_PHONE_ID || !WHATSAPP_TOKEN) {
  throw new Error('WHATSAPP_PHONE_ID and WHATSAPP_TOKEN must be set in environment variables');
}

export async function sendWhatsAppMessage(phone: string, code: string): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: Buffer.from(
      JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: 'whatsup_otp',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: code }],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      }),
      'utf8',
    ),
  });

  const responseBody = await response.json();
  // eslint-disable-next-line no-console
  console.log('[WhatsApp API]', response.status, JSON.stringify(responseBody));

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(responseBody)}`);
  }

  // OTP happens pre-auth, so attribute the spend by resolving the phone to a
  // registered user when one exists (NULL otherwise). Fire-and-forget.
  void resolveUserIdByPhone(phone)
    .then((userId) =>
      recordFixedUsage({
        userId,
        kind: 'otp_whatsapp',
        provider: 'whatsapp',
        priceKey: 'whatsapp.otp_message',
      }),
    )
    .catch(() => {});
}
