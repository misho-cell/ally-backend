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

/**
 * #6304 (tester 77511, 4 of 10): „გიორგი ხატიაშვილის გაცნობა მინდა", then the
 * owner picks the bridge with „ლიკას სთხოვე". Neither line alone is a whole
 * introduction, so the server's own introduction never ran and the owner read
 * „კითხვა ვერ გაიგზავნა". The two together are: through Lika, to Giorgi.
 */
/** „X-ის გაცნობა მინდა", and a goal's own title „X-ის / X-თან გაცნობა (…)". */
const WANTS_TO_MEET_RE = /^(.{2,80}?)\s+გაცნობა(?=$|[\s(.,!])/u;
const TAN_RE = /თან$/u;
/** Words that point at someone already named, never a name themselves. */
const POINTING_WORDS: ReadonlySet<string> = new Set(['მისი', 'მათი', 'ამის', 'იმის', 'მისთვის']);
const GENITIVE_IS_RE = /ის$/u;
const GENITIVE_S_AFTER_VOWEL_RE = /[აეიოუ]ს$/u;
const LINE_END_RE = /[\s.!]+$/u;

/** „ხატიაშვილის" → „ხატიაშვილი", „ნინოს" → „ნინო"; a name only its last word declines. */
function nominativeOfGenitive(word: string): string {
  if (GENITIVE_IS_RE.test(word)) return `${word.slice(0, -2)}ი`;
  return GENITIVE_S_AFTER_VOWEL_RE.test(word) ? word.slice(0, -1) : word;
}

/** The person a „X-ის გაცნობა მინდა" line or a goal title asks to meet, in the nominative; else null. */
export function personToMeetIn(line: string): string | null {
  const match = WANTS_TO_MEET_RE.exec(line.trim());
  if (match === null) return null;
  const words = cleanWords(match[1]);
  if (words.length === 0 || words.length > MAX_TARGET_WORDS) return null;
  if (words.some((w) => POINTING_WORDS.has(w))) return null;
  const declined = words.pop() ?? '';
  const last = TAN_RE.test(declined)
    ? nominativeBeforeTan(declined.slice(0, -3))
    : nominativeOfGenitive(declined);
  return [...words, last].join(' ');
}

/** The bridge named now and the person asked for before, as one introduction sentence; else null. */
export function introductionThroughNamedBridge(
  ownerLine: string,
  earlierOwnerLines: readonly string[],
): string | null {
  if (introductionSentence(ownerLine) !== null || instructionNamed(ownerLine) === null) return null;
  for (const earlier of earlierOwnerLines) {
    const target = personToMeetIn(earlier);
    if (target !== null) return `${ownerLine.replace(LINE_END_RE, '')}, გამაცნოს ${target}`;
  }
  return null;
}

/**
 * #6304 (tester 77587): on a goal to meet someone, a question sent to a bridge
 * is that introduction. The person comes from the owner's own „X-ის გაცნობა
 * მინდა", never from an exact-name match, so two namesakes cannot stop it.
 */
export function personToMeetFromLines(ownerLines: readonly string[]): string | null {
  for (const line of ownerLines) {
    const target = personToMeetIn(line);
    if (target !== null) return target;
  }
  return null;
}

const NAME_STEM_CHARS = 4;

/** True when the contact asked is the person to meet themselves, not a bridge. */
export function isThePersonToMeet(contactName: string, target: string): boolean {
  const stems = cleanWords(target.toLowerCase()).map((w) => w.slice(0, NAME_STEM_CHARS));
  const words = cleanWords(contactName.toLowerCase());
  return stems.length > 0 && stems.every((stem) => words.some((w) => w.startsWith(stem)));
}

export interface ServerIntroduction {
  readonly mediator: string;
  readonly target: string;
}

/** 2311 (§140): the go-between has never opened the app; the owner is asked whether to send anyway. */
export interface DormantGoBetween {
  readonly dormant: string;
}

const DORMANT_REASON = 'dormant_account';

/**
 * The introduction made by the server for the owner's typed line; null when
 * the line names no single saved go-between, no readable target, or the
 * request was refused (requestIntroduction's own walls stand).
 */
/**
 * Tester 77651 (73404): the server's own introduction returned nothing and said
 * nothing, so a miss could not be told from a refusal. Each early stop says
 * which; the reason only, never the owner's words or a number.
 */
function notMade(userId: string, reason: string): null {
  // eslint-disable-next-line no-console
  console.log(`[server-intro] user ${userId}: not made (${reason})`);
  return null;
}

export async function serverIntroduces(
  userId: string,
  ownerLine: string,
  context: IntroRequestContext,
): Promise<ServerIntroduction | DormantGoBetween | null> {
  const sentence = introductionSentence(ownerLine);
  if (sentence === null) return notMade(userId, 'no introduction sentence');
  const target = introductionTarget(sentence);
  if (target === null) return notMade(userId, 'no target read');
  const phone = await oneContactNamed(userId, sentence);
  if (phone === null) return notMade(userId, 'no single contact named');
  const mediator = (await ownersLabel(userId, phone, instructionNamed(sentence) ?? '')).trim();
  if (mediator === '') return notMade(userId, 'no label for the contact');
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
  )) as { success?: unknown; reason?: unknown };
  if (outcome.success === true) return { mediator, target };
  if (outcome.reason === DORMANT_REASON) return { dormant: mediator };
  // 2311 (box 56943): every refusal here was silent, so a lookup that never
  // matched read like a model that never tried. The reason code only: the
  // refusal's text can carry the number.
  // eslint-disable-next-line no-console
  console.log(
    `[server-intro] user ${userId}: refused (${typeof outcome.reason === 'string' ? outcome.reason : 'no reason code'})`,
  );
  return null;
}

/** MODEL-FREE, OWNER-FACING (needs Misho's yes): the introduction went, in the per-person line's shape. */
// 5149 F (D583, Giorgi): the request went to the mediator's assistant, and the line says so.
const INTRO_SENT_SENTENCES: Readonly<Record<RunLanguage, (m: string, t: string) => string>> = {
  ka: (m, t) =>
    `${geoName(m, 'gen')} ასისტენტს თხოვნა გავუგზავნე, რომ ${geoName(m, 'erg')} ${t} გაგაცნოს. ` +
    'როგორც კი პასუხი მოვა, მაშინვე მოგწერ.',
  en: (m, t) =>
    `I sent ${m}'s assistant a request for ${m} to introduce you to ${t}. I will tell you as ` +
    'soon as the answer comes.',
  ru: (m, t) =>
    `Я отправил ассистенту ${m} просьбу познакомить вас: ${t}. Напишу, как только придёт ответ.`,
  es: (m, t) =>
    `Envié al asistente de ${m} la petición de que ${m} te presente a ${t}. Te escribo en ` +
    'cuanto llegue la respuesta.',
};

export function introSentSentence(made: ServerIntroduction, language: RunLanguage): string {
  return (INTRO_SENT_SENTENCES[language] ?? INTRO_SENT_SENTENCES.ka)(made.mediator, made.target);
}

/**
 * OWNER-FACING (D44): Misho's yes word for word, 13 Oct 19:05 UTC (§140). The
 * owner's „yes" is read by the next run, which may then pass accept_dormant.
 */
const DORMANT_SENTENCES: Readonly<Record<RunLanguage, (m: string) => string>> = {
  ka: (m) =>
    `${m} Netai-ზე რეგისტრირებულია, მაგრამ აპი ჯერ არ გაუხსნია, ამიტომ თხოვნას ვერ ნახავს, სანამ არ შემოვა. მაინც გავუგზავნო?`,
  en: (m) =>
    `${m} is on Netai but hasn't opened the app yet, so they won't see the request until they do. Send it anyway?`,
  ru: (m) =>
    `${m} есть в Netai, но ещё ни разу не открывал приложение, поэтому не увидит просьбу, пока не зайдёт. Всё равно отправить?`,
  es: (m) =>
    `${m} está en Netai pero aún no ha abierto la app, así que no verá la petición hasta que entre. ¿La envío de todos modos?`,
};

export function dormantSentence(found: DormantGoBetween, language: RunLanguage): string {
  return (DORMANT_SENTENCES[language] ?? DORMANT_SENTENCES.ka)(found.dormant);
}
