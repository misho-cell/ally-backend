/**
 * 1687 (box 48535, 1 of 1): the owner wrote „ჰკითხე თამარს, ხომ არ იცნობს კარგ
 * არქიტექტორს…" and then six sentences of facts — Vake, a 600 m² slope plot,
 * two floors, the budget, spring, slope experience, English. The run sent
 * nothing, so the server asked Tamar itself (§97 item 1) with the instruction's
 * question only: 71 characters, every fact dropped, while the owner was told
 * his requirements had gone. The facts the owner wrote around the instruction
 * now go with the question, as his own words like the question itself; the
 * editor and the §106 shortener („keep every fact") still run on the result.
 */
const SENTENCE_END_RE = /(?<=[.!?…])\s+/u;

/**
 * The owner's sentences AFTER the instruction, in his order. What he wrote
 * before it is context for Netai, never sent (QA-001, conv 42765), and the
 * instruction itself is already the question.
 */
export function factsAround(ownerLine: string, isInstruction: (s: string) => boolean): string[] {
  const sentences = ownerLine
    .split(SENTENCE_END_RE)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
  const at = sentences.findIndex(isInstruction);
  return at === -1 ? [] : sentences.slice(at + 1);
}

/** The question followed by as many whole fact sentences as fit in `maxChars`. */
export function questionWithFacts(
  question: string,
  facts: readonly string[],
  maxChars: number,
): string {
  let text = question.trim();
  for (const fact of facts) {
    const longer = `${text} ${fact}`;
    if (longer.length > maxChars) break;
    text = longer;
  }
  return text;
}
