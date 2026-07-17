import { scrubText } from './privacyScrub';

// Trailing characters withheld from each streamed chunk. Per-token scrubbing
// can't catch a phone number split across deltas, so we scrub the WHOLE buffer
// each time and never emit its last N chars — long enough to hold any
// still-forming phone-like run — until more text proves them safe. The caller's
// run_complete carries the full authoritative (scrubbed) reply regardless.
const ANSWER_STREAM_HOLDBACK_CHARS = 40;

export interface SafeTextStreamer {
  push: (delta: string) => void;
  flush: () => void;
}

/**
 * Forwards streaming model text to `emit` as append-only, phone-safe chunks. It
 * accumulates the raw text, scrubs the WHOLE buffer on every push, and emits
 * only the portion before the trailing holdback — so a phone number forming
 * across deltas is never emitted unscrubbed. flush() emits whatever safe
 * remainder is left when the stream ends.
 */
export function createSafeTextStreamer(emit: (chunk: string) => void): SafeTextStreamer {
  let raw = '';
  let emitted = 0;
  const emitUpTo = (end: number): void => {
    const scrubbed = scrubText(raw);
    const safeEnd = Math.min(end, scrubbed.length);
    if (safeEnd > emitted) {
      emit(scrubbed.slice(emitted, safeEnd));
      emitted = safeEnd;
    }
  };
  return {
    push: (delta: string): void => {
      raw += delta;
      emitUpTo(scrubText(raw).length - ANSWER_STREAM_HOLDBACK_CHARS);
    },
    flush: (): void => emitUpTo(scrubText(raw).length),
  };
}
