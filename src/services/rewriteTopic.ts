/**
 * T2542 (the tester's 45147, conv 42811): the owner's line arrived while Netai
 * was running by itself. The model asked the helper whether he remembers
 * Zaza's number or surname; the editor, reading the owner's newest line,
 * rewrote it into a different question — „შაბათობით მუშაობ თუ არა" — and that
 * is what went. The editor fixes HOW a question is put, never WHAT is asked:
 * a rewrite that keeps none of the draft's words (by their first letters, so
 * an inflection still counts) is a different question, and is not used.
 */
const WORD_RE = /[\p{L}\p{N}]+/gu;
const MIN_WORD_CHARS = 4;
/** Georgian and Russian inflect at the end; the first five letters carry the word. */
const STEM_CHARS = 5;
/** Fewer content words than this, and a draft has no topic to compare. */
const MIN_TOPIC_WORDS = 2;

function stems(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(WORD_RE) ?? [])
      .filter((w) => w.length >= MIN_WORD_CHARS)
      .map((w) => w.slice(0, STEM_CHARS)),
  );
}

/** True when the rewrite shares no content word with a draft that has a topic. */
export function rewriteChangedTheQuestion(draft: string, rewrite: string): boolean {
  const before = stems(draft);
  if (before.size < MIN_TOPIC_WORDS) return false;
  const after = stems(rewrite);
  for (const stem of before) if (after.has(stem)) return false;
  return true;
}
