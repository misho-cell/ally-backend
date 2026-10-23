import { createHash } from 'crypto';

/**
 * THE SAME RIGHT CODE, SENT TWICE, IS STILL RIGHT.
 *
 * Misho's video, 23 Oct 17:40Z (iPhone, the Claude app adding Netai): the
 * WhatsApp code was filled in from the keyboard's suggestion, the page posted
 * it, and the person tapped Verify as well. The first post was accepted — the
 * stored code is single-use, so it was spent — and the server answered with
 * the way back to Claude. The second post found no code left, and its
 * „The code is wrong or has expired" page replaced that answer on the screen.
 * The database showed the code accepted and the sign-in code never collected.
 *
 * So a code this page accepted a moment ago is accepted again for the same
 * number, for a short while. Only someone holding the right code can match it,
 * so it proves exactly what the first post proved. Held in memory: one server
 * process (railway.toml), and a restart only loses a two-minute grace.
 */

export const REPEAT_GRACE_MS = 2 * 60_000;

const accepted = new Map<string, number>();

function keyFor(phone: string, code: string): string {
  return createHash('sha256')
    .update(`${phone.replace(/\D/g, '')}:${code}`)
    .digest('hex');
}

function forgetExpired(now: number): void {
  for (const [key, until] of accepted) {
    if (until <= now) accepted.delete(key);
  }
}

/** Remember that this number's code was just accepted. */
export function rememberAcceptedCode(phone: string, code: string, now: number = Date.now()): void {
  forgetExpired(now);
  accepted.set(keyFor(phone, code), now + REPEAT_GRACE_MS);
}

/** True when this exact code was accepted for this number within the grace. */
export function wasJustAccepted(phone: string, code: string, now: number = Date.now()): boolean {
  if (!code) return false;
  forgetExpired(now);
  return accepted.has(keyFor(phone, code));
}
