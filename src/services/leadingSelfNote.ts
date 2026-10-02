import { RunLanguage } from './runLanguage';

/**
 * Task #432 — the tester's 1033, thread 30500 (11:59:32Z): a Georgian reply
 * opened with a line the model wrote to itself, in English:
 *
 *   „every ask carries sender's name automatically, no "send without my name"
 *    option. Answer accordingly."
 *
 * No server text says that (searched: the code and every prompt block); the
 * model put its own working note at the top of the reply, and the owner read
 * it. So a first paragraph that carries not one letter of the conversation's
 * own script, while the rest of the reply is written in it, is taken off.
 *
 * Narrow on purpose: only the FIRST paragraph, only in a conversation whose
 * script is not Latin (an English reply has no such tell), only when it reads
 * as words (four or more Latin words) and carries no link — a page address or
 * an English firm name on its own line is content, and it keeps its place.
 */
const SCRIPT_OF: Partial<Record<RunLanguage, RegExp>> = {
  ka: /[ა-ჿ]/,
  ru: /[Ѐ-ӿ]/,
};
const MIN_NOTE_WORDS = 4;
const LATIN_WORD_RE = /[A-Za-z]{2,}/g;
const LINK_RE = /https?:\/\/|www\.|\.ge\b|\.com\b/i;
const PARAGRAPH_BREAK_RE = /\n\s*\n/;

function readsAsForeignNote(paragraph: string, script: RegExp): boolean {
  if (script.test(paragraph) || LINK_RE.test(paragraph)) return false;
  return (paragraph.match(LATIN_WORD_RE) ?? []).length >= MIN_NOTE_WORDS;
}

/** The reply without a leading note in another script; unchanged when there is none. */
export function withoutLeadingSelfNote(text: string, language: RunLanguage): string {
  const script = SCRIPT_OF[language];
  if (script === undefined) return text;
  const trimmed = text.trimStart();
  const breakAt = trimmed.search(PARAGRAPH_BREAK_RE);
  if (breakAt === -1) return text;
  const first = trimmed.slice(0, breakAt);
  const rest = trimmed.slice(breakAt).trimStart();
  if (!script.test(rest) || !readsAsForeignNote(first, script)) return text;
  // eslint-disable-next-line no-console
  console.warn(
    `[self-note] a leading note in another script was taken off (${first.length} chars)`,
  );
  return rest;
}
