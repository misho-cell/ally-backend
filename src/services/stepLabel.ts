/**
 * The live step label (Ticket 10 Task 2 (b); Lika, 3 Sep): while the assistant
 * works, the steps panel shows what is being done NOW — one short line, never
 * an explanation. The model's narration between turns is often a paragraph;
 * this keeps the first sentence and cuts the rest. Only the label shown live is
 * cut: the narration itself is persisted whole, because it may be the run's
 * real answer (chat.service lifts the longest saved step when the final reply
 * is empty).
 */

const MAX_STEP_LABEL_CHARS = 120;
const ELLIPSIS = '…';
// A sentence ends at . ! ? or the Georgian full stop, followed by space or end.
const SENTENCE_END_RE = /[.!?։]\s|[.!?։]$/;

export function stepLabel(narration: string): string {
  // The first non-empty line, then its first sentence.
  const firstLine = narration.split('\n').find((line) => line.trim() !== '') ?? '';
  const flat = firstLine.replace(/\s+/g, ' ').trim();
  if (flat === '') return flat;
  const end = flat.search(SENTENCE_END_RE);
  const first = end === -1 ? flat : flat.slice(0, end + 1).trim();
  if (first.length <= MAX_STEP_LABEL_CHARS) return first;
  return first.slice(0, MAX_STEP_LABEL_CHARS - 1).trimEnd() + ELLIPSIS;
}
