/**
 * D648 (the founder, box 37654): no quotation in either direction. The tester's
 * 1154 found the gap the whole-line checks left: one sentence of a message,
 * letter for letter, inside a longer text —
 *
 *   to the helper  „პარასკევსაც ვერ ვახერხებ." — the owner's own sentence, then
 *                  the assistant's question after it (38572);
 *   to the owner   „51-ე საჯარო სკოლაში ვასწავლი ინგლისურს, ვაკეში, 2015
 *                  წლიდან." — the helper's first person, unchanged (38745).
 *
 * Their 1156 found the next one: the same sentence with one word dropped
 * („მე" in 38776) passed the letter-for-letter test and still read as hers. So
 * a sentence also counts as carried over when a stretch of the sent text takes
 * most of its words in order and adds no word of its own — words left out, none
 * changed. A real rewording changes a word („ვასწავლი" → „ასწავლის") and breaks
 * the stretch, even though the facts in it stay exact.
 *
 * A sentence long enough to be somebody's wording is checked; short replies
 * („არ ვიცი", a name) are facts, not wording, and stay below the bar.
 */
const MIN_SENTENCE_CHARS = 20;
const MIN_SENTENCE_WORDS = 3;
/** The share of a sentence's words a stretch with no words of its own may carry. */
const MAX_WORDS_KEPT_SHARE = 0.7;
/**
 * Below this a sentence is mostly its facts („პარასკევს 12 საათზე
 * შეიძლება?"), which the rewording keeps on purpose; only a whole copy counts.
 */
const MIN_WORDS_FOR_NEAR_COPY = 6;
const SENTENCE_END_RE = /(?<=[.!?…;])\s+|\n+/u;
const NOISE_RE = /[^\p{L}\p{N}]+/gu;

function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(NOISE_RE, ' ').trim().split(' ').filter(Boolean);
}

/** How many of `sentence`'s words, in order, a stretch of `sent` from `start` takes with nothing added. */
function wordsTakenFrom(
  sentence: readonly string[],
  sent: readonly string[],
  start: number,
): number {
  let next = 0;
  let taken = 0;
  for (let i = start; i < sent.length; i += 1) {
    const at = sentence.indexOf(sent[i], next);
    if (at < 0) break;
    next = at + 1;
    taken += 1;
  }
  return taken;
}

function carriesMostOf(sentence: readonly string[], sent: readonly string[]): boolean {
  const needed =
    sentence.length < MIN_WORDS_FOR_NEAR_COPY
      ? sentence.length
      : Math.ceil(sentence.length * MAX_WORDS_KEPT_SHARE);
  for (let start = 0; start + needed <= sent.length; start += 1) {
    if (wordsTakenFrom(sentence, sent, start) >= needed) return true;
  }
  return false;
}

/** The first sentence of `source` that `sent` carries whole or with words only left out, or null. */
export function sentenceCarriedOver(source: string, sent: string): string | null {
  const sentWords = wordsOf(sent);
  for (const sentence of source.split(SENTENCE_END_RE)) {
    const own = wordsOf(sentence);
    if (own.join(' ').length < MIN_SENTENCE_CHARS || own.length < MIN_SENTENCE_WORDS) continue;
    if (carriesMostOf(own, sentWords)) return sentence.trim();
  }
  return null;
}
