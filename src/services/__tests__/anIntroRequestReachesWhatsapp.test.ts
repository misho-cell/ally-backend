/**
 * Misho, 24 Nov: the app is retired. A request for an introduction told its
 * person only when they had a browser push subscription, so a member who uses
 * only WhatsApp never heard of it; and missing push keys silenced WhatsApp too.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const intro = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
const notification = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');

describe('an introduction request reaches a WhatsApp-only member', () => {
  it('is sent when the person has push OR has chosen WhatsApp', () => {
    expect(intro).toContain(
      'const notified = hasPush || (await reachedInWhatsapp(Number(mediatorUserId)));',
    );
    expect(intro).toMatch(/if \(notified\) \{\s*await sendPushNotification\(/su);
    expect(intro).toContain('push_sent: notified,');
    expect(intro).toContain('(await whatsappChannelOn()) && (await hasWhatsappConsent(userId))');
  });
});

describe('missing push keys stop only the push', () => {
  it('checks the keys after the WhatsApp copy has gone', () => {
    const body = notification.slice(
      notification.indexOf('export async function sendPushNotification('),
    );
    const mirrored = body.indexOf('void mirrorToWhatsapp(');
    const keys = body.indexOf('if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)');
    expect(mirrored).toBeGreaterThan(0);
    expect(keys).toBeGreaterThan(mirrored);
  });
});
