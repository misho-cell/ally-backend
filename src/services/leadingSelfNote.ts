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

/**
 * The tester's 44223 (the introduction trio, owner conversation 42164): a
 * Georgian reply opened „Good, დავადასტურე: …" — one English word of the
 * model's own, glued to the first sentence. A short English interjection at the
 * very start of a reply written in the conversation's script comes off; a name
 * or a firm in Latin letters is never in this list and keeps its place.
 */
const LEADING_INTERJECTION_RE =
  /^\s*(?:good|great|ok|okay|done|perfect|sure|alright|got it|noted|understood)\s*[,.!:—-]+\s*/iu;

export function withoutLeadingInterjection(text: string, language: RunLanguage): string {
  const script = SCRIPT_OF[language];
  if (script === undefined) return text;
  const match = LEADING_INTERJECTION_RE.exec(text);
  if (match === null) return text;
  const rest = text.slice(match[0].length);
  if (!script.test(rest.slice(0, 1))) return text;
  return rest;
}

/**
 * The tester's 44584 b (owner conversation 42451, 15:24:27Z): the answer wake
 * is told the server has already shown the answer, and the reply opened with
 * that very note — „ეს უკვე ნაჩვენები პასუხია, ახალი არაფერია." — before its
 * real question. A leading paragraph that only says the answer was already
 * shown, or that nothing is new, comes off when something follows it.
 */
const ALREADY_SHOWN_RE =
  /(უკვე\s+(?:ნაჩვენები|გაჩვენე|ნაჩვენებია|ნახე)|ახალი\s+არაფერი(?:ა)?|already\s+(?:been\s+)?shown|nothing\s+new)/iu;
const MAX_NOTE_CHARS = 120;

export function withoutAlreadyShownNote(text: string): string {
  const trimmed = text.trimStart();
  const breakAt = trimmed.search(PARAGRAPH_BREAK_RE);
  if (breakAt === -1) return text;
  const first = trimmed.slice(0, breakAt);
  const rest = trimmed.slice(breakAt).trimStart();
  if (rest === '' || first.length > MAX_NOTE_CHARS || !ALREADY_SHOWN_RE.test(first)) return text;
  // eslint-disable-next-line no-console
  console.warn('[self-note] an „already shown" note was taken off the top of a reply');
  return rest;
}
