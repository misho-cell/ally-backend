/**
 * 2909 (the master test run's 45679, conv 44086): one 538-character reply held
 * the same two paragraphs twice, the halves identical, each ending „დავიწყო?".
 * A paragraph written word for word a second time says nothing new, so only its
 * first copy stays. Short lines are left alone: „კი." may stand twice on purpose.
 */
const PARAGRAPH_SPLIT_RE = /\n[ \t]*\n/u;
const MIN_REPEATED_CHARS = 20;

function normalised(paragraph: string): string {
  return paragraph.replace(/\s+/gu, ' ').trim();
}

export function withoutRepeatedParagraphs(text: string): string {
  const paragraphs = text.split(PARAGRAPH_SPLIT_RE);
  const seen = new Set<string>();
  const kept = paragraphs.filter((paragraph) => {
    const key = normalised(paragraph);
    if (key.length < MIN_REPEATED_CHARS) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return kept.length === paragraphs.length ? text : kept.join('\n\n').trim();
}
