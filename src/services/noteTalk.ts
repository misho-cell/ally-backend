/**
 * T2478 (§98.2): the model explained the server's own notes to the owner —
 * „ეს შენიშვნა ნამდვილად ჩემი სისტემური წესების ნაწილი არ არის…" (the MASTER
 * TEST RUN's AP-001, conv 42660). The notes are written for the model; the
 * owner never sees them, so a sentence about them means nothing to her. A
 * sentence that talks about a system note, system rules or system
 * instructions is taken out of the final reply. Narrow on purpose: only those
 * words, and never the whole reply.
 */
const SENTENCE_RE = /[^.!?\n]*[.!?]?/gu;
const NOTE_TALK_RE =
  /(სისტემურ\S*\s+(?:შენიშვნ|წეს|ინსტრუქცი)|(?:ეს|ამ)\s+შენიშვნ|\bsystem\s+(?:notes?|rules?|instructions?|messages?)\b|системн\S*\s+(?:замечан|правил|указан|сообщен))/iu;
const DOUBLE_SPACE_RE = / {2,}/gu;
const SPACE_BEFORE_BREAK_RE = / +\n/gu;
const EMPTY_PARAGRAPHS_RE = /\n{3,}/gu;

/** The reply without sentences about the server's notes; unchanged when nothing is left. */
export function withoutNoteTalk(text: string): string {
  if (!NOTE_TALK_RE.test(text)) return text;
  const kept = text
    .replace(SENTENCE_RE, (sentence) => (NOTE_TALK_RE.test(sentence) ? '' : sentence))
    .replace(DOUBLE_SPACE_RE, ' ')
    .replace(SPACE_BEFORE_BREAK_RE, '\n')
    .replace(EMPTY_PARAGRAPHS_RE, '\n\n')
    .trim();
  if (kept === '') return text;
  // eslint-disable-next-line no-console
  console.warn('[note-talk] a sentence about the server’s own notes was taken out of a reply');
  return kept;
}
