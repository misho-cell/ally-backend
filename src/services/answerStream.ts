import { scrubText } from './privacyScrub';

// Per-token scrubbing can't catch a phone number split across deltas, so we
// scrub the WHOLE buffer on every push and withhold the tail that could still
// be growing into one. The tail used to be a flat 40 characters, which in
// Georgian is six or seven words: the visible answer stopped mid-word and
// caught up only when more text arrived ("შუა სიტყვას წყვეტს და მერე
// დაგვიანებით ამთავრებს" — Lika, 12 Aug). Now only a trailing run that could
// BE a forming number is held, so ordinary prose streams with no lag at all
// and the guarantee is unchanged: a number is never emitted before the scrub
// has seen enough of it to recognise it.
//
// Phone-shaped characters: digits and the separators people type inside a
// number. The run must reach back to where the number could have STARTED —
// scrubbing rewrites from the "+" onwards, so emitting a bare "+" and only
// then seeing the digits would splice a half-scrubbed number into the stream.
// A run therefore qualifies if it holds a digit OR a leading "+".
const PHONE_TAIL_CHARS = /[0-9+()\-\s]$/;
const NUMBER_STARTER = /[0-9+]/;

export interface SafeTextStreamer {
  push: (delta: string) => void;
  flush: () => void;
  /** The scrubbed text emitted so far — what the user has actually seen. */
  emittedText: () => string;
}

/**
 * How many trailing characters could still be part of a number being typed.
 * Deliberately uncapped: a long run of digits is precisely what a leaking
 * number looks like, so holding it is the correct behaviour — flush() releases
 * the scrubbed remainder when the stream ends.
 */
function formingNumberTailLength(text: string): number {
  let i = text.length;
  while (i > 0 && PHONE_TAIL_CHARS.test(text[i - 1])) i -= 1;
  const tail = text.slice(i);
  return NUMBER_STARTER.test(tail) ? tail.length : 0;
}

/**
 * Forwards streaming model text to `emit` as append-only, phone-safe chunks. It
 * accumulates the raw text, scrubs the WHOLE buffer on every push, and holds
 * back only a trailing run that could still become a phone number.
 * flush() emits whatever safe remainder is left when the stream ends.
 */
export function createSafeTextStreamer(emit: (chunk: string) => void): SafeTextStreamer {
  let raw = '';
  let emitted = 0;
  let emittedText = '';
  const emitUpTo = (end: number): void => {
    const scrubbed = scrubText(raw);
    const safeEnd = Math.min(end, scrubbed.length);
    if (safeEnd > emitted) {
      const chunk = scrubbed.slice(emitted, safeEnd);
      emit(chunk);
      emittedText += chunk;
      emitted = safeEnd;
    }
  };
  return {
    push: (delta: string): void => {
      raw += delta;
      const scrubbed = scrubText(raw);
      emitUpTo(scrubbed.length - formingNumberTailLength(scrubbed));
    },
    flush: (): void => emitUpTo(scrubText(raw).length),
    emittedText: (): string => emittedText,
  };
}
