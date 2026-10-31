import { RunLanguage } from './runLanguage';
import { isOfficialDomain } from './tools/webSearch';
import { GeminiHit } from './tools/geminiSearch';
import { WorldAnswer, WorldPerson } from './worldAnswer';

/**
 * #8350 item 4 (the founder via the tester, box 79213; Misho's yes, 31 Oct): a
 * public fact Netai found on an official page (who holds an office) is kept and
 * used for the same question again, by any member, instead of searching from
 * zero. The pure half: how a question is compared, which pages count, and the
 * answer written from what was kept.
 */

/** Words shorter than this carry no meaning for the comparison („და", „is"). */
const MIN_WORD_LENGTH = 3;
/** Share of words two questions must have in common to be the same question. */
export const SAME_ASK_SHARE = 0.8;
/** How long a kept fact is used before the web is asked again. */
export const FACT_FRESH_DAYS = 7;
/** How long a kept fact is kept at all. */
export const FACT_KEPT_DAYS = 30;
const WORD_RE = /[\p{L}\p{N}]+/gu;
const KEY_SEPARATOR = ' ';
const DAY_MS = 86_400_000;

export interface KeptSource {
  readonly title: string;
  readonly url: string;
}

export interface KeptFact {
  readonly id: number;
  readonly askKey: string;
  readonly people: readonly WorldPerson[];
  readonly sources: readonly KeptSource[];
  readonly checkedAt: Date;
  /** The first answer's own words, said again (tester 79546); null for a fact kept before them. */
  readonly answerText: string | null;
}

/** The question as it is compared: lower case, its distinct words, sorted. */
export function askKey(question: string): string {
  const words = (question.toLowerCase().match(WORD_RE) ?? []).filter(
    (w) => w.length >= MIN_WORD_LENGTH,
  );
  return [...new Set(words)].sort().join(KEY_SEPARATOR);
}

/** True when two questions share enough of their words to be one question. */
export function isSameAsk(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  const left = new Set(a.split(KEY_SEPARATOR));
  const right = new Set(b.split(KEY_SEPARATOR));
  const shared = [...left].filter((w) => right.has(w)).length;
  return shared / new Set([...left, ...right]).size >= SAME_ASK_SHARE;
}

/** A Georgian site: the network's offices are Georgian, and a foreign „.gov" listing is not their page. */
const GEORGIAN_HOST_RE = /\.ge$/i;

function isGeorgianOfficial(url: string): boolean {
  try {
    return isOfficialDomain(url) && GEORGIAN_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The Georgian official pages among an answer's sources; only these make it a
 * fact worth keeping. Tester 79546: a CIA „World Leaders" page passed as
 * official (any „.gov"); it is not the office's page.
 */
export function officialSources(sources: readonly GeminiHit[]): KeptSource[] {
  return sources
    .filter((s) => isGeorgianOfficial(s.url))
    .map((s) => ({ title: s.title, url: s.url }));
}

/** True when the kept fact is recent enough to answer with. */
export function isFresh(checkedAt: Date, now: Date): boolean {
  return now.getTime() - checkedAt.getTime() < FACT_FRESH_DAYS * DAY_MS;
}

function personLine(person: WorldPerson): string {
  const where = [person.role, person.organisation].filter((f) => f.trim() !== '').join(', ');
  return where === '' ? `${person.name}.` : `${person.name} — ${where}.`;
}

const MONTHS_KA: readonly string[] = [
  'იანვარს',
  'თებერვალს',
  'მარტს',
  'აპრილს',
  'მაისს',
  'ივნისს',
  'ივლისს',
  'აგვისტოს',
  'სექტემბერს',
  'ოქტომბერს',
  'ნოემბერს',
  'დეკემბერს',
];
const MONTHS_EN: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * When it was checked, per language; none where there is no wording yet. Tester
 * 79546: it no longer says „on the official page" — a kept source may be a
 * register or a government listing, not the office's own site.
 */
const CHECKED_LINE: Readonly<Partial<Record<RunLanguage, (date: Date) => string>>> = {
  ka: (date) => `(შემოწმდა ${date.getUTCDate()} ${MONTHS_KA[date.getUTCMonth()]})`,
  en: (date) => `(checked ${date.getUTCDate()} ${MONTHS_EN[date.getUTCMonth()]})`,
};

/**
 * The first answer written from a kept fact, or null in a language with no
 * wording for it. Tester 79546: the first answer's own words are said again,
 * with the official contact it gave and in Netai's voice, and the day it was
 * checked; a fact kept before those words were kept is said person by person.
 */
export function rememberedAnswer(fact: KeptFact, language: RunLanguage): WorldAnswer | null {
  const checked = CHECKED_LINE[language];
  if (checked === undefined || fact.people.length === 0 || fact.sources.length === 0) return null;
  const words = fact.answerText?.trim() || fact.people.map(personLine).join('\n');
  return {
    text: `${words}\n${checked(fact.checkedAt)}`,
    people: fact.people,
    sources: fact.sources.map((s) => ({ ...s, snippet: '' })),
  };
}
