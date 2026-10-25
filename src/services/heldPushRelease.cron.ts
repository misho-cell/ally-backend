import { releaseHeldPushes } from './notification.service';
import { releaseHeldWhatsapp } from './whatsappMirror.service';

/**
 * Push quiet hours (G-002): every minute, send the held pushes whose 09:30 has
 * come. A minute is the release's whole lateness; one tick at a time, so two
 * ticks can never send the same held push twice.
 */
const RELEASE_EVERY_MS = 60_000;

async function releaseOnce(): Promise<void> {
  try {
    const sent = await releaseHeldPushes();
    if (sent > 0) {
      // eslint-disable-next-line no-console
      console.log(`[push] quiet hours over: released ${sent} held push(es)`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] held-push release failed:', (err as Error).message);
  }
  // The same morning for what waited to go to WhatsApp (Misho, 25 Oct).
  try {
    const sent = await releaseHeldWhatsapp();
    if (sent > 0) {
      // eslint-disable-next-line no-console
      console.log(`[whatsapp] quiet hours over: released ${sent} held message(s)`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp] held release failed:', (err as Error).message);
  }
}

export function startHeldPushRelease(): void {
  const tick = (): void => {
    void releaseOnce().then(() => {
      setTimeout(tick, RELEASE_EVERY_MS).unref();
    });
  };
  setTimeout(tick, RELEASE_EVERY_MS).unref();
}
