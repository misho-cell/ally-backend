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

/**
 * Send an APPROVED template with plain text parameters — for the outage alarm.
 *
 * ⚠️ WHY THIS IS SEPARATE FROM `sendWhatsAppMessage`. That one is welded to
 * `whatsup_otp`: one body parameter and one URL-button parameter, both the
 * login code. It cannot carry a sentence, and using it for anything else would
 * deliver „Your code is: <an outage report>" — wrong for the reader and a
 * breach of WhatsApp's own rules.
 *
 * ⚠️ AND WHATSAPP BUSINESS DOES NOT ALLOW FREE TEXT HERE. Outside a
 * twenty-four hour window opened by the person writing to us first, only
 * approved templates may be sent. So `templateName` must already exist and be
 * approved in the Meta Business account; this function cannot create one and
 * neither can I. It is passed in rather than hard-coded precisely so that the
 * day somebody creates it, nothing in this file needs editing.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  parameters: readonly string[],
): Promise<void> {
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
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: parameters.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
      'utf8',
    ),
  });

  const responseBody = await response.json();
  // The phone is NOT logged (D149). The status and the provider's complaint
  // are, because „template not found" and „that number is unreachable" are
  // different problems with different owners.
  // eslint-disable-next-line no-console
  console.log('[WhatsApp alert]', response.status, JSON.stringify(responseBody));

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(responseBody)}`);
  }
}
