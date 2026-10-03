import { RunLanguage } from './runLanguage';

/**
 * ⚠️ TESTER 907 / D531 — NO „SOLVED?" UNDER AN ANSWERS CARD.
 *
 * The relay chain on fresh seats, 30 Sep 21:10: the card showed Test 74's
 * „yes, I know an accountant", and the run under it ended on „does this solve
 * it?" with „მოგვარებულია / ჯერ არა". Nothing had been connected — Test 74 had
 * only agreed. The event said not to ask, twice, and the model asked anyway;
 * this is row 315's fault on a new path, and a sentence in an event has now
 * failed to hold it three times. So the server holds it.
 *
 * A run that starts from an answers card is, by construction, the moment an
 * answer arrived: a connection cannot have happened yet. The finish card is
 * taken off, and a reply that was ONLY that question is replaced with the
 * line D531 actually wants — tell me when you have spoken.
 */

/** Present in every event whose answers the server has already put on a card. */
export const ALREADY_ON_CARD = 'მფლობელს უკვე აჩვენა';
const EVENT_PREFIX = '[მოვლენა]';

/** A reply this short that ends on a question is the finish question and nothing else. */
const SHORT_QUESTION_CHARS = 120;

const NOT_YET_WORDS: readonly string[] = ['ჯერ არა', 'not yet', 'пока нет', 'todavía no'];

/*
 * The tester's 1118 (34709, 34996): „which taxi driver…?" answered „გურამი", and
 * the line said „when you two have spoken" — nobody was going to speak. The line
 * now fits a plain answer and a connection alike: it waits for the owner's word.
 */
const SPEAK_FIRST: Readonly<Record<RunLanguage, string>> = {
  ka: 'როცა დარწმუნდები, რომ ეს გიშველის, მომწერე — მაშინ დავხურავ.',
  en: 'When you are sure this settles it, tell me and I will close it.',
  ru: 'Когда убедишься, что это решает вопрос, напиши мне — тогда закрою.',
  es: 'Cuando veas que esto lo resuelve, avísame y lo cierro.',
};

export interface GuardedReply {
  readonly text: string;
  readonly choices: string[] | undefined;
}

/** Did this run start from an answers card? */
export function isAnswerCardEvent(userMessage: string): boolean {
  return userMessage.startsWith(EVENT_PREFIX) && userMessage.includes(ALREADY_ON_CARD);
}

/**
 * The tester's 962 (28944): „ჯერ არა, სხვასაც ჰკითხე" was left alone under an
 * empty reply after its „solved" partner was removed. The not-yet half of a
 * finish card goes with it, however the model went on after „ჯერ არა".
 */
function isNotYetLabel(label: string): boolean {
  const said = label.trim().toLowerCase();
  return NOT_YET_WORDS.some(
    (w) => said === w || said.startsWith(`${w},`) || said.startsWith(`${w} `),
  );
}

/** The reply without its finish card, or null when it offered none. */
export function withoutEarlySolvedCard(
  text: string,
  choices: readonly string[] | undefined,
  language: RunLanguage,
  isSolvedLabel: (label: string) => boolean,
): GuardedReply | null {
  if (choices === undefined || !choices.some(isSolvedLabel)) return null;
  const kept = choices.filter((label) => !isSolvedLabel(label) && !isNotYetLabel(label));
  const trimmed = text.trim();
  const endsOnTheQuestion = trimmed.length <= SHORT_QUESTION_CHARS && trimmed.endsWith('?');
  return {
    text: endsOnTheQuestion ? withSpeakFirst(trimmed, language) : text,
    choices: kept.length > 0 ? kept : undefined,
  };
}

/**
 * The tester's 1121 (35436): a short reply that said WHEN and WHERE before its
 * „solved?" lost both with the question. Only the closing question is
 * replaced; what the reply said before it stays.
 */
function withSpeakFirst(text: string, language: RunLanguage): string {
  const line = SPEAK_FIRST[language] ?? SPEAK_FIRST.ka;
  const before = text.slice(0, lastSentenceStart(text)).trim();
  return before === '' ? line : `${before} ${line}`;
}

/** Where the last sentence begins: after the last full stop, „!" or line break before the end. */
function lastSentenceStart(text: string): number {
  const body = text.slice(0, -1);
  return Math.max(...SENTENCE_ENDS.map((end) => body.lastIndexOf(end))) + 1;
}

const SENTENCE_ENDS: readonly string[] = ['.', '!', '?', '\n'];
