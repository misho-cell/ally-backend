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
 * A sentence long enough to be somebody's wording, and found whole in what is
 * about to go, is a quotation. Short replies („არ ვიცი", a name) are facts,
 * not wording, and stay below the bar.
 */
const MIN_SENTENCE_CHARS = 20;
const MIN_SENTENCE_WORDS = 3;
const SENTENCE_END_RE = /(?<=[.!?…;])\s+|\n+/u;
const NOISE_RE = /[^\p{L}\p{N}]+/gu;

function comparable(text: string): string {
  return text.toLowerCase().replace(NOISE_RE, ' ').trim();
}

/** The first sentence of `source` that `sent` carries whole, or null. */
export function sentenceCarriedOver(source: string, sent: string): string | null {
  const target = ` ${comparable(sent)} `;
  for (const sentence of source.split(SENTENCE_END_RE)) {
    const own = comparable(sentence);
    if (own.length < MIN_SENTENCE_CHARS || own.split(' ').length < MIN_SENTENCE_WORDS) continue;
    if (target.includes(` ${own} `)) return sentence.trim();
  }
  return null;
}
