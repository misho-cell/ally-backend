/**
 * 4919 (Giorgi, 13 Oct): in „შენს პასუხს ელოდება", „ვმუშაობ" and
 * „მოგვარებული" every case title is a long sentence that does not fit. The
 * design wants two or three words on a desktop and one on a phone, naming the
 * case. Made from the full title (already in its language and already free of
 * names the user did not give), by the same cheap model, after it is set.
 *
 * MODEL-FACING (D44): Misho's yes, 13 Oct 19:05 UTC in the code session's chat
 * („ჩემგან ყვეკაფერზე კია", §140). Older conversations are filled by
 * POST /admin/short-titles/backfill (Misho's yes, 14 Oct).
 */
export const SHORT_TITLES_ON = true;

/** #5215 (Giorgi, again 27 Oct, G-186): three or four words. */
export const SHORT_TITLE_MAX_WORDS = 4;
export const SHORT_TITLE_MAX_CHARS = 48;
export const ONE_WORD_TITLE_MAX_CHARS = 24;

export interface ShortTitles {
  readonly short_title: string;
  readonly one_word_title: string;
}

export function shortTitlesPrompt(language: string): string {
  return (
    'Shorten the conversation title below. Answer with exactly two lines. Line 1: three or ' +
    'four words that still name what the conversation is about. Line 2: one word that ' +
    `names it. Write in ${language} only, and use words from the title. No quotes, no ` +
    'numbering, no punctuation at the end, nothing else.'
  );
}

const ALLOWED_RE = /[^\p{Script=Georgian}\p{Script=Latin}\p{Script=Cyrillic}0-9 '&-]/gu;
const HAS_LETTER_RE = /[\p{Script=Georgian}\p{Script=Latin}\p{Script=Cyrillic}]/u;
const NUMBERING_RE = /^\s*(?:line\s*\d|\d)\s*[:.)-]\s*/iu;

/** One line cleaned to at most `maxWords` words and `maxChars` characters; null if unusable. */
function cleanLine(line: string, maxWords: number, maxChars: number): string | null {
  const words = line
    .replace(NUMBERING_RE, '')
    .replace(ALLOWED_RE, ' ')
    .split(/\s+/u)
    .filter((w) => HAS_LETTER_RE.test(w))
    .slice(0, maxWords);
  const text = words.join(' ');
  return text.length >= 2 && text.length <= maxChars ? text : null;
}

/** The model's two lines as the two titles; null when either is unusable. */
export function parseShortTitles(raw: string): ShortTitles | null {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 2) return null;
  const short = cleanLine(lines[0], SHORT_TITLE_MAX_WORDS, SHORT_TITLE_MAX_CHARS);
  const oneWord = cleanLine(lines[1], 1, ONE_WORD_TITLE_MAX_CHARS);
  return short === null || oneWord === null
    ? null
    : { short_title: short, one_word_title: oneWord };
}
