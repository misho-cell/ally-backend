import { RunLanguage } from './runLanguage';

/**
 * The tester's 47588 (run f93fceab): an English answer ended „Levan … is saved
 * as a lawyer.\n\nრამე სხვა გჭირდება ამასთან დაკავშირებით?" — the writer's
 * Georgian voice slipped a whole closing line into an English conversation.
 *
 * In a conversation that is not Georgian, a paragraph written almost entirely
 * in Georgian letters is dropped when the rest of the reply is not. Georgian
 * names and labels inside an English sentence are untouched: only a paragraph
 * that IS Georgian goes.
 */
const GEORGIAN_LETTER_RE = /[ა-ჿ]/gu;
const ANY_LETTER_RE = /\p{L}/gu;
const NON_GEORGIAN_LETTER_RE = /[A-Za-z\u0400-\u04FF]/u;
const GEORGIAN_WORD_RE = /[ა-ჿ]{2,}/gu;
const MIN_GEORGIAN_SHARE = 0.8;
const MIN_GEORGIAN_WORDS = 3;

function isAGeorgianParagraph(paragraph: string): boolean {
  const letters = paragraph.match(ANY_LETTER_RE)?.length ?? 0;
  if (letters === 0) return false;
  const georgian = paragraph.match(GEORGIAN_LETTER_RE)?.length ?? 0;
  const words = paragraph.match(GEORGIAN_WORD_RE)?.length ?? 0;
  return words >= MIN_GEORGIAN_WORDS && georgian / letters >= MIN_GEORGIAN_SHARE;
}

/** The reply without whole Georgian paragraphs, in a conversation that is not Georgian. */
export function withoutStrayGeorgian(reply: string, language: RunLanguage): string {
  if (language === 'ka') return reply;
  const paragraphs = reply.split(/\n\s*\n/u);
  const kept = paragraphs.filter((paragraph) => !isAGeorgianParagraph(paragraph));
  // A reply with nothing left in another script is not a stray line: it is left for the
  // checks that judge a whole reply's language.
  if (kept.length === paragraphs.length || !kept.some((p) => NON_GEORGIAN_LETTER_RE.test(p))) {
    return reply;
  }
  return kept.join('\n\n');
}
