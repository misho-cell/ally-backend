import { sentenceCarriedOver } from './sentenceCarriedOver';
import { nameKey } from './tools/transliterate';
/**
 * Board #100 (plate F1): when Netai worded a question for the owner it changed
 * facts. An ask said „for a friend" though the owner asked for himself, and
 * „last year" became „this year". The person asked answers what they read, so
 * a changed fact is a wrong answer delivered politely.
 *
 * Checked in code before a question goes out, against the owner's own lines
 * in the goal's conversation. Two checks, each narrow:
 *
 *   beneficiary  the question says it is for a friend or an acquaintance, and
 *                the owner never mentioned one;
 *   time         the question carries a time word, the owner used time words,
 *                and not this one.
 *
 * A miss costs a question that goes out as today; a false refusal costs one
 * rewrite. Both checks therefore fire only on a word that is plainly there.
 */
/**
 * 3037/3670 (tester 44551; asks 17039, 17722, 18252 on 8–9 October): „მეგობარს
 * ეზო აქვს", „ჩემმა მეგობარმა", „მეგობარს ესაჭიროება" went out though the owner
 * named nobody. Every SINGULAR case of „friend" counts; the plural („შენს
 * მეგობრებში" — among your friends) is how a question is asked, and stays.
 */
const BENEFICIARY_IN_QUESTION_RE =
  /(მეგობ(?:არ(?:ს|მა|ი|ის|თან)?|რის(?:თვის)?)(?![\p{L}])|ნაცნობისთვის|ჩემს\s+ნაცნობს|for\s+a\s+friend|a\s+friend\s+of\s+mine|my\s+friend|для\s+друга|мой\s+друг|моему\s+другу)/iu;

/** The owner naming somebody else at all: a friend, an acquaintance, family. */
const OWNER_NAMES_SOMEONE_ELSE_RE =
  /(მეგობ|ნაცნობ|ძმა|ძმის|დეიდა|მამიდა|ბიძა|მეუღლ|ცოლ|ქმარ|შვილ|\b(friend|acquaint\w*|brother|sister|mother|father|mom|dad|wife|husband|son|daughter|cousin|colleague)s?\b|друг|знаком|брат|сестр|жен|муж)/iu;

/** Time words that name a different moment from each other. */
const TIME_WORDS: readonly (readonly string[])[] = [
  ['შარშან', 'last year', 'в прошлом году'],
  ['წელს', 'ამ წელს', 'this year', 'в этом году'],
  ['გუშინ', 'yesterday', 'вчера'],
  ['დღეს', 'today', 'сегодня'],
  ['ხვალ', 'tomorrow', 'завтра'],
  ['გასულ კვირას', 'წინა კვირას', 'last week', 'на прошлой неделе'],
  ['ამ კვირაში', 'ამ კვირას', 'this week', 'на этой неделе'],
  ['მომავალ კვირას', 'შემდეგ კვირას', 'next week', 'на следующей неделе'],
  ['მომავალ წელს', 'next year', 'в следующем году'],
];

export enum FactChange {
  Beneficiary = 'beneficiary',
  Time = 'time',
  Detail = 'detail',
}

/**
 * Tester 39832 (#1552): the owner wrote „ტვირთი მაქვს ჩამოსატანი" (cargo) and
 * the ask read „ტვირთის (ავეჯის) ჩამოტანა" — furniture, a detail he never gave.
 * A word the model puts in brackets to narrow the owner's own is the plainest
 * form of it: one whose stem is nowhere in the owner's lines is held back.
 */
const BRACKETED_RE = /\(([^()]{1,60})\)/gu;
const WORD_RE = /\p{L}{4,}/gu;
/** Enough of a word to survive a case ending: „ავეჯი" / „ავეჯის" share „ავეჯ". */
const DETAIL_STEM_CHARS = 4;

/**
 * #1618 (tester 40229): the owner asked for someone to help paint a car; the
 * question read „a RELIABLE person you could recommend". A quality the owner
 * never asked for, with or without brackets, is a detail added.
 */
const QUALITY_WORD_RE =
  /(?:^|[\s,.!?„"(])(სანდო\p{L}*|საიმედო\p{L}*|reliable|trusted|trustworthy|надёжн\p{L}*|надежн\p{L}*|проверенн\p{L}*|confiable)/iu;

function qualityNotSaid(question: string, owner: string): string | null {
  const match = QUALITY_WORD_RE.exec(question);
  if (match === null) return null;
  const word = match[1];
  return lowered(owner).includes(lowered(word).slice(0, DETAIL_STEM_CHARS)) ? null : word;
}

function bracketedDetailNotSaid(question: string, owner: string): string | null {
  const low = lowered(owner);
  const ownerKey = nameKey(owner);
  const said = (w: string): boolean =>
    low.includes(lowered(w).slice(0, DETAIL_STEM_CHARS)) ||
    ownerKey.includes(nameKey(w).slice(0, DETAIL_STEM_CHARS));
  for (const match of question.matchAll(BRACKETED_RE)) {
    const words = match[1].match(WORD_RE) ?? [];
    const unsaid = words.find((w) => !said(w));
    if (unsaid !== undefined) return unsaid;
  }
  return null;
}

export interface FactChanged {
  readonly change: FactChange;
  /** The word in the question that the owner did not say. */
  readonly word: string;
}

function lowered(text: string): string {
  return text.toLowerCase();
}

/** The index of each time group the text mentions, and the word it used. */
function timeGroupsIn(text: string): Map<number, string> {
  const found = new Map<number, string>();
  const low = lowered(text);
  TIME_WORDS.forEach((group, index) => {
    const word = group.find((w) => low.includes(w));
    if (word !== undefined) found.set(index, word);
  });
  return found;
}

/** What the question changed from the owner's own lines, or null when it kept them. */
export function factChangedIn(question: string, ownerLines: readonly string[]): FactChanged | null {
  const owner = ownerLines.join('\n');
  const beneficiary = BENEFICIARY_IN_QUESTION_RE.exec(question);
  if (beneficiary !== null && !OWNER_NAMES_SOMEONE_ELSE_RE.test(owner)) {
    return { change: FactChange.Beneficiary, word: beneficiary[0] };
  }
  const ownerTimes = timeGroupsIn(owner);
  if (ownerTimes.size > 0) {
    for (const [group, word] of timeGroupsIn(question)) {
      if (!ownerTimes.has(group)) return { change: FactChange.Time, word };
    }
  }
  const detail = bracketedDetailNotSaid(question, owner) ?? qualityNotSaid(question, owner);
  return detail === null ? null : { change: FactChange.Detail, word: detail };
}

const CHANGE_EXPLAINED: Readonly<Record<FactChange, (word: string) => string>> = {
  [FactChange.Beneficiary]: (word) =>
    `it says „${word}", but the owner never said it is for anybody else — they are asking for themselves`,
  [FactChange.Time]: (word) =>
    `it says „${word}", a time the owner did not give — keep the owner's own time words`,
  [FactChange.Detail]: (word) =>
    `it adds „${word}", a detail the owner did not give — keep the owner's own word, not a narrower one`,
};

/** What the model is told when a question is held back for a changed fact. */
export function factChangedRefusal(changed: FactChanged): string {
  const what = CHANGE_EXPLAINED[changed.change](changed.word);
  return (
    `Not sent: ${what}. Rewrite the question with every fact exactly as the owner wrote it — ` +
    'who it is for, when, where, how much — and add no reason, beneficiary or time of your own. ' +
    'Then send it again. Do not tell the owner about this; it is a rewrite, not news.'
  );
}

/**
 * D648 in the asker's direction (the tester's 1152, 38572): a follow-up to the
 * helper opened with the owner's exact words — „ხუთშაბათს ვერ ვახერხებ, …" —
 * a quotation of the owner carried to somebody else. A question that holds one
 * of the owner's own lines whole is held back; the facts stay, the words are
 * the assistant's.
 */
/** The owner's sentence the question repeats whole, or null (the tester's 1154: one sentence is enough). */
export function ownersLineQuoted(question: string, ownerLines: readonly string[]): string | null {
  for (const line of ownerLines) {
    const carried = sentenceCarriedOver(line, question);
    if (carried !== null) return carried;
  }
  return null;
}

export const OWNERS_LINE_QUOTED_REFUSAL =
  "Not sent: the question repeats the owner's own words — a sentence of theirs, letter for " +
  'letter. D648: write it in ' +
  'your own words — what the owner means, never a quotation — and keep every fact exactly ' +
  '(names, days, times, places, amounts). Then send it again. Do not tell the owner; it is a ' +
  'rewrite, not news.';
