const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

if (!WHATSAPP_PHONE_ID || !WHATSAPP_TOKEN) {
  throw new Error('WHATSAPP_PHONE_ID and WHATSAPP_TOKEN must be set in environment variables');
}

export async function sendWhatsAppMessage(phone: string, code: string): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: Buffer.from(
      JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
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
              sub_type: 'copy_code',
              index: '0',
              parameters: [{ type: 'coupon_code', coupon_code: code }],
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
}
