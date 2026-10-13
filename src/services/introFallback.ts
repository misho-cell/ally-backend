import { geoName } from './georgianCase';
import { instructionNamed } from './goalIntent';
import { ownerAsksForIntroduction } from './introInstruction';
import { oneContactNamed, ownersLabel } from './instructedAsk';
import { RunLanguage } from './runLanguage';
import { IntroRequestContext, requestIntroduction } from './tools/requestIntroduction';

/**
 * 2311 (box 55934, 13 Oct, 0 of 6 after 0190; 2 of 5 before it): the owner
 * typed „სთხოვე გიორგი X-ს, დამაკავშიროს ნინო X-თან" and the model called
 * neither request_introduction nor ask_contact, even after the guard's second
 * chance. The server's fallback then sent the owner's line to the go-between
 * as a plain question (before 0190), or nothing at all (with it). Neither is
 * what was asked. The typed line is the consent (D316), so the server makes
 * the introduction itself, through the same requestIntroduction the tool uses.
 *
 * ON since Misho's yes (CE), 13 Oct 11:2x UTC in the operations chat: „ჩემგან
 * ყველაფერზე კია" — to INTRO_SENT_SENTENCES as written below (§139). Back to
 * false and the fallback is exactly what it was before.
 */
export const SERVER_INTRODUCTION_ON = true;

const SENTENCE_RE = /[^.!?\n]+[.!?]?/gu;
const MAX_TARGET_WORDS = 3;
const NOMINATIVE_VERB_RE = /(?:გამაცნოს|გაგვაცნოს|გამაცანი)\s+([^.,!?;\n]+)/u;
const TAN_AFTER_VERB_RE =
  /(?:დამაკავშიროს|დაგვაკავშიროს|შემაერთოს|შეგვაერთოს|დამაკავშირე|შემაერთე)\s+((?:\S+\s+)?\S+)თან(?![\p{L}])/u;
const TAN_BEFORE_NOUN_RE = /((?:\S+\s+)?\S+)თან\s+(?:დაკავშირება|გაცნობა)/u;
const REQUEST_VERB_RE = /^(?:სთხოვე|თხოვე|ჰკითხე|კითხე|უთხარი|მისწერე)$/u;
const EDGE_PUNCTUATION_RE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const GEORGIAN_VOWEL_RE = /[აეიოუ]$/u;

/** The first sentence of the owner's line that asks to be introduced; null for none. */
export function introductionSentence(ownerLine: string): string | null {
  const sentences = (ownerLine.match(SENTENCE_RE) ?? []).map((s) => s.trim());
  return sentences.find((s) => ownerAsksForIntroduction([s])) ?? null;
}

/** „საცდელთან" → „საცდელი", „ნინოსთან" → „ნინო", „X-თან" → „X": the name as the card writes it. */
export function nominativeBeforeTan(stem: string): string {
  if (stem.endsWith('-')) return stem.slice(0, -1);
  if (stem.endsWith('ს') && GEORGIAN_VOWEL_RE.test(stem.slice(0, -1))) return stem.slice(0, -1);
  return GEORGIAN_VOWEL_RE.test(stem) ? stem : `${stem}ი`;
}

function cleanWords(text: string): string[] {
  return text
    .split(/\s+/u)
    .map((w) => w.replace(EDGE_PUNCTUATION_RE, ''))
    .filter((w) => w !== '');
}

/** The person the owner wants to meet, in the nominative; null when it cannot be read for sure. */
export function introductionTarget(sentence: string): string | null {
  const nominative = NOMINATIVE_VERB_RE.exec(sentence);
  if (nominative !== null) {
    const words = cleanWords(nominative[1]).slice(0, MAX_TARGET_WORDS);
    return words.length > 0 ? words.join(' ') : null;
  }
  const tan = TAN_AFTER_VERB_RE.exec(sentence) ?? TAN_BEFORE_NOUN_RE.exec(sentence);
  if (tan === null) return null;
  const words = tan[1].split(/\s+/u).filter((w) => w !== '');
  const last = words.pop() ?? '';
  const before = words.filter((w) => !REQUEST_VERB_RE.test(w.replace(EDGE_PUNCTUATION_RE, '')));
  const name = [...cleanWords(before.join(' ')), nominativeBeforeTan(last)].filter((w) => w !== '');
  return name.length > 0 && last !== '' ? name.join(' ') : null;
}

export interface ServerIntroduction {
  readonly mediator: string;
  readonly target: string;
}

/**
 * The introduction made by the server for the owner's typed line; null when
 * the line names no single saved go-between, no readable target, or the
 * request was refused (requestIntroduction's own walls stand).
 */
export async function serverIntroduces(
  userId: string,
  ownerLine: string,
  context: IntroRequestContext,
): Promise<ServerIntroduction | null> {
  const sentence = introductionSentence(ownerLine);
  if (sentence === null) return null;
  const target = introductionTarget(sentence);
  const phone = await oneContactNamed(userId, sentence);
  if (target === null || phone === null) return null;
  const mediator = (await ownersLabel(userId, phone, instructionNamed(sentence) ?? '')).trim();
  if (mediator === '') return null;
  const outcome = (await requestIntroduction(
    userId,
    mediator,
    target,
    undefined,
    phone,
    undefined,
    undefined,
    'intro',
    false,
    context,
  )) as { success?: unknown };
  return outcome.success === true ? { mediator, target } : null;
}

/** MODEL-FREE, OWNER-FACING (needs Misho's yes): the introduction went, in the per-person line's shape. */
const INTRO_SENT_SENTENCES: Readonly<Record<RunLanguage, (m: string, t: string) => string>> = {
  ka: (m, t) =>
    `${geoName(m, 'dat')} თხოვნა გავუგზავნე, რომ ${t} გაგაცნოს. როგორც კი გიპასუხებს, მაშინვე მოგწერ.`,
  en: (m, t) => `I asked ${m} to introduce you to ${t}. I will tell you as soon as they answer.`,
  ru: (m, t) => `Я попросил ${m} познакомить вас: ${t}. Напишу, как только будет ответ.`,
  es: (m, t) => `Le pedí a ${m} que te presente a ${t}. Te escribo en cuanto responda.`,
};

export function introSentSentence(made: ServerIntroduction, language: RunLanguage): string {
  return (INTRO_SENT_SENTENCES[language] ?? INTRO_SENT_SENTENCES.ka)(made.mediator, made.target);
}
