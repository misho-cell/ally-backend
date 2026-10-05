import { AMBIGUOUS_FIRST_NAMES, GEORGIAN_FIRST_NAMES } from './georgianFirstNames';

/**
 * D648 (the founder, 4 Oct, box 37654): no quotation in either direction — the
 * helper's answer goes in the assistant's own words — and the facts stay
 * exact. Every name, number, price, time, date, address and link in the
 * helper's line must reach the asker unchanged; a send that drops one is
 * refused with the missing facts named, and the model writes it once more.
 *
 * A phone number is not one of these facts: it travels only through the #991
 * tool, as a placeholder, never inside a reworded answer.
 */
const PHONE_DIGITS_MIN = 7;
/** How many letters of a Georgian word are kept when its case ending may change. */
const CASE_ENDING_CHARS = 2;
const MIN_STEM_CHARS = 3;

const NUMBER_RE = /\d+(?:[.,:/-]\d+)*/gu;
const LINK_RE = /(?:https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.]+)/giu;
const LATIN_WORD_RE = /\b[A-Za-z][A-Za-z'’-]{2,}\b/gu;
const WORD_RE = /[\p{L}]+/gu;
/** Words a surname ends with, in its plain or case form. */
const SURNAME_RE = /^\p{L}+(?:შვილ|ძე|ძის|ავა|უა|ანი|ელი|ია)\p{L}{0,3}$/u;
/** The word before one of these is the street's name. */
const STREET_RE = /([ა-ჰ]+)\s+(?:ქ\.|ქუჩ\p{L}*|გამზ\.|გამზირ\p{L}*|ჩიხ\p{L}*|შესახვ\p{L}*)/gu;
/**
 * Districts and towns, as the start of the word in any case form („ვაკეში",
 * „ვაკის", „საბურთალოზე"). Not a street, so STREET_RE misses them; the tester's
 * 1156 caught „ვაკეში" added to an answer that never said it (38777).
 */
const PLACE_RES: readonly RegExp[] = [
  /^ვაკ[ეი]/u,
  /^საბურთალო/u,
  /^მთაწმინდ/u,
  /^ვაზისუბ/u,
  /^ისან[იშზს]/u,
  /^სამგორ/u,
  /^დიდუბ/u,
  /^ჩუღურეთ/u,
  /^გლდან/u,
  /^ნაძალადევ/u,
  /^დიღომ/u,
  /^ორთაჭალ/u,
  /^ავლაბარ/u,
  /^სოლოლაკ/u,
  /^ვარკეთილ/u,
  /^ოქროყან/u,
  /^წყნეთ/u,
  /^თბილის/u,
  /^ბათუმ/u,
  /^ქუთაის/u,
  /^რუსთავ/u,
  /^ზუგდიდ/u,
  /^თელავ/u,
  /^მცხეთ/u,
  /^ბორჯომ/u,
  /^ახალციხ/u,
  /^ზესტაფონ/u,
  /^სამტრედი/u,
  /^ხაშურ/u,
  /^მარნეულ/u,
  /^ქობულეთ/u,
  /^გუდაურ/u,
  /^ბაკურიან/u,
];
/** Above this share of Latin letters a line is written in Latin, not Georgian with a brand in it. */
const LATIN_LINE_SHARE = 0.5;
/** Capitalised only because they open a sentence. */
const SENTENCE_WORDS: ReadonlySet<string> = new Set([
  'the',
  'she',
  'his',
  'her',
  'they',
  'their',
  'yes',
  'sure',
  'great',
  'good',
  'there',
  'this',
  'that',
  'try',
  'ask',
  'call',
  'sorry',
  'maybe',
  'not',
  'one',
  'both',
  'all',
]);
/** Latin words that are ordinary words, not a brand or a name. */
const ORDINARY_LATIN: ReadonlySet<string> = new Set([
  'and',
  'the',
  'for',
  'but',
  'not',
  'yes',
  'okay',
  'thanks',
  'please',
  'hello',
  'netai',
]);

function stemOf(word: string): string {
  const lower = word.toLowerCase();
  return lower.length - CASE_ENDING_CHARS >= MIN_STEM_CHARS
    ? lower.slice(0, -CASE_ENDING_CHARS)
    : lower;
}

export function isFirstName(word: string): boolean {
  const lower = word.toLowerCase();
  if (AMBIGUOUS_FIRST_NAMES.has(lower)) return false;
  if (GEORGIAN_FIRST_NAMES.has(lower)) return true;
  // A case form: „გიორგის", „ნინოს", „დავითმა".
  for (let cut = 1; cut <= CASE_ENDING_CHARS; cut += 1) {
    const base = lower.slice(0, -cut);
    if (base.length >= MIN_STEM_CHARS && GEORGIAN_FIRST_NAMES.has(base)) return true;
  }
  return false;
}

/** A fact as the helper wrote it, and how its presence is tested in a sent text. */
export interface AnswerFact {
  /** As written in the helper's line — what the refusal names. */
  readonly written: string;
  /** Lower-case text that must appear in the sent answer. */
  readonly mustAppear: string;
}

function numbersOf(line: string): AnswerFact[] {
  return [...line.matchAll(NUMBER_RE)]
    .map((m) => m[0])
    .filter((n) => n.replace(/\D/gu, '').length < PHONE_DIGITS_MIN)
    .map((n) => ({ written: n, mustAppear: n }));
}

function linksOf(line: string): AnswerFact[] {
  return [...line.matchAll(LINK_RE)].map((m) => {
    const link = m[0].replace(/[.,;:!?)»"”]+$/u, '');
    return { written: link, mustAppear: link.toLowerCase() };
  });
}

/**
 * In a Georgian line a Latin word stands out: a brand, a firm, a name. In a
 * line written in Latin letters every word is Latin, so only a capitalised one
 * is a name or a brand — the tester's 1159: „Baxva Gamogonili, my daughter had
 * lessons with him, great tutor." counted „daughter", „lessons" and „great"
 * as facts, and every rewording „lost" nine of them.
 */
function isMostlyLatin(line: string): boolean {
  const latin = (line.match(/[A-Za-z]/gu) ?? []).length;
  const letters = (line.match(/\p{L}/gu) ?? []).length;
  return letters > 0 && latin / letters > LATIN_LINE_SHARE;
}

function latinWordsOf(line: string): AnswerFact[] {
  const withoutLinks = line.replace(LINK_RE, ' ');
  const onlyCapitalised = isMostlyLatin(withoutLinks);
  return [...withoutLinks.matchAll(LATIN_WORD_RE)]
    .map((m) => m[0])
    .filter((w) => !onlyCapitalised || (/^[A-Z]/u.test(w) && !SENTENCE_WORDS.has(w.toLowerCase())))
    .filter((w) => !ORDINARY_LATIN.has(w.toLowerCase()) && !isFirstName(w))
    .map((w) => ({ written: w, mustAppear: w.toLowerCase() }));
}

function namesOf(line: string): AnswerFact[] {
  const words = [...line.matchAll(WORD_RE)].map((m) => m[0]);
  const facts: AnswerFact[] = [];
  words.forEach((word, i) => {
    if (!isFirstName(word)) return;
    facts.push({ written: word, mustAppear: stemOf(word) });
    const next = words[i + 1] ?? '';
    if (SURNAME_RE.test(next)) facts.push({ written: next, mustAppear: stemOf(next) });
  });
  return facts;
}

/** The places a text names, each as the word it was first written in. */
export function placesOf(text: string): Map<number, string> {
  const places = new Map<number, string>();
  for (const word of text.toLowerCase().match(WORD_RE) ?? []) {
    const at = PLACE_RES.findIndex((re) => re.test(word));
    if (at >= 0 && !places.has(at)) places.set(at, word);
  }
  return places;
}

/** Numbers that are facts — a phone number is not one (it travels by the #991 tool). */
export function factNumbersOf(text: string): string[] {
  return numbersOf(text).map((fact) => fact.written);
}

/** Links, with trailing punctuation cut. */
export function linksIn(text: string): string[] {
  return linksOf(text).map((fact) => fact.mustAppear);
}

function streetsOf(line: string): AnswerFact[] {
  return [...line.matchAll(STREET_RE)].map((m) => ({
    written: m[1],
    mustAppear: stemOf(m[1]),
  }));
}

/** The facts in the helper's line that the sent answer must carry unchanged. */
export function factsOf(helperLine: string): AnswerFact[] {
  const all = [
    ...namesOf(helperLine),
    ...numbersOf(helperLine),
    ...linksOf(helperLine),
    ...latinWordsOf(helperLine),
    ...streetsOf(helperLine),
  ];
  const seen = new Set<string>();
  return all.filter((fact) => {
    if (seen.has(fact.mustAppear)) return false;
    seen.add(fact.mustAppear);
    return true;
  });
}

/** The helper's facts the sent answer lost or changed, as the helper wrote them. */
export function missingFacts(helperLine: string, sentText: string): string[] {
  const sent = sentText.toLowerCase();
  const sentPlaces = placesOf(sentText);
  const lostPlaces = [...placesOf(helperLine)]
    .filter(([at]) => !sentPlaces.has(at))
    .map(([, word]) => word);
  const lost = factsOf(helperLine)
    .filter((fact) => !sent.includes(fact.mustAppear))
    .map((fact) => fact.written);
  return [...new Set([...lost, ...lostPlaces])];
}

export function missingFactsRefusal(missing: readonly string[]): string {
  return (
    `Not sent: the answer lost or changed facts the helper gave — include exactly: ` +
    `${missing.join(', ')}. Keep the rest in your own words, no quotation, and send again.`
  );
}
