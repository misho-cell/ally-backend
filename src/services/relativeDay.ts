/**
 * Ticket 20 row 141 — „tomorrow" in a goal title, read a week later.
 *
 * Thread 15815, „რომელი მიზნები მაქვს ღია?": goal 2971 was listed as „ლიკა
 * ოსეფაშვილთან შეხვედრა (ხვალ, 19:00)". That meeting was on 14 September. The
 * word was typed then and replayed as if it had been written today.
 *
 * A relative day word is only meaningful next to the day it was written on.
 * Frozen into a title it does not merely age — it actively lies, and it lies
 * confidently: „tomorrow" on a list read today names a future that has
 * already happened.
 *
 * So the server resolves it. The title is left exactly as the owner typed it —
 * their words are theirs — and the real date is stated beside it, with whether
 * it has passed. The model copies rather than counts, which is row 119's
 * lesson applied to a date nobody thought to check.
 */

const TBILISI_TZ = 'Asia/Tbilisi';
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/**
 * WHOLE WORDS ONLY, and the reason is a defect family this codebase has now
 * met five times: a substring standing in for a word.
 *
 * Georgian inflects on the END of a word, so the tempting rule — match the
 * stem at a word start — is what „tel" inside „hotel" and „მიდი" inside
 * „მიდის" already cost us. Here it is worse than usual, because the stems
 * collide with ordinary vocabulary:
 *
 *   ზეგ    (the day after tomorrow)  is the start of  ზეგავლენა  (influence)
 *   დღეს   (today)                   is the start of  დღესასწაული (a holiday)
 *
 * Annotating „influence" with a date would be a confident wrong answer about
 * somebody's meeting. Missing „ზეგისთვის" costs nothing at all — the title
 * still reads as the owner wrote it. When only one of the two mistakes is
 * expensive, the rule bends the safe way.
 */
const OFFSETS: ReadonlyArray<readonly [string, number]> = [
  ['გუშინ', -1],
  ['დღეს', 0],
  ['ხვალ', 1],
  ['ზეგ', 2],
  ['yesterday', -1],
  ['today', 0],
  ['tomorrow', 1],
];

/** Georgian letters are not JS word characters, so \b cannot be used here. */
const NOT_A_LETTER = '(?<![\\p{L}\\p{N}])';
const NOT_A_LETTER_AFTER = '(?![\\p{L}\\p{N}])';

function dayIn(zone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function georgianDate(at: Date): string {
  return new Intl.DateTimeFormat('ka-GE', {
    timeZone: TBILISI_TZ,
    month: 'long',
    day: 'numeric',
  }).format(at);
}

export interface ResolvedDay {
  /** The word as the owner wrote it. */
  readonly word: string;
  /** What it meant on the day it was written, in Tbilisi. */
  readonly date: string;
  readonly past: boolean;
}

/**
 * Every relative day word in a piece of text, resolved against when it was
 * written.
 *
 * Returns an empty list for text with no such word, so a caller can append
 * nothing in the ordinary case — most titles carry no date at all and must not
 * grow a clause explaining that.
 */
export function resolveRelativeDays(text: string, writtenAt: Date, now: Date): ResolvedDay[] {
  const found: ResolvedDay[] = [];
  const seen = new Set<string>();
  const today = dayIn(TBILISI_TZ, now);
  for (const [word, offset] of OFFSETS) {
    const re = new RegExp(`${NOT_A_LETTER}${word}${NOT_A_LETTER_AFTER}`, 'iu');
    if (!re.test(text) || seen.has(word)) continue;
    seen.add(word);
    const at = new Date(writtenAt.getTime() + offset * MS_PER_DAY);
    found.push({ word, date: georgianDate(at), past: dayIn(TBILISI_TZ, at) < today });
  }
  return found;
}

/**
 * The clause to put beside a title, or '' when there is nothing to say.
 *
 * „გასული" is stated rather than left to arithmetic: „14 სექტემბერი" on its
 * own still needs the reader to know today's date and compare, and comparing
 * is the step that went wrong in the first place.
 */
export function relativeDayNote(text: string, writtenAt: Date, now: Date): string {
  const days = resolveRelativeDays(text, writtenAt, now);
  if (days.length === 0) return '';
  const parts = days.map((d) => `„${d.word}" = ${d.date}${d.past ? ', უკვე გასული' : ''}`);
  return ` [${parts.join('; ')}]`;
}
