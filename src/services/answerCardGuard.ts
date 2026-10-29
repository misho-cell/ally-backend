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

/**
 * The tester's 1123 (35739): the meeting was told in full and the reply closed
 * on „ჩათვალოთ ეს საკითხი მოგვარებულად?" with no buttons at all — the question
 * in words, which the button check never saw. A closing sentence that asks
 * whether it is solved is the finish question however it arrives.
 */
const ASKS_IF_SOLVED_RE =
  /(მოგვარ|მოგვარდა|გადაწყდა|solved|settled|resolved|решен|решён|resuelto)/iu;

/** The reply without its finish card or finish question, or null when it offered neither. */
export function withoutEarlySolvedCard(
  text: string,
  choices: readonly string[] | undefined,
  language: RunLanguage,
  isSolvedLabel: (label: string) => boolean,
): GuardedReply | null {
  const trimmed = text.trim();
  const finishCard = choices !== undefined && choices.some(isSolvedLabel);
  const finishQuestion = trimmed.endsWith('?') && ASKS_IF_SOLVED_RE.test(lastSentence(trimmed));
  if (!finishCard && !finishQuestion) return null;
  const kept = (choices ?? []).filter((label) => !isSolvedLabel(label) && !isNotYetLabel(label));
  const shortQuestion = trimmed.length <= SHORT_QUESTION_CHARS && trimmed.endsWith('?');
  return {
    text: finishQuestion || shortQuestion ? withSpeakFirst(trimmed, language) : text,
    choices: kept.length > 0 ? kept : undefined,
  };
}

function lastSentence(text: string): string {
  return text.slice(lastSentenceStart(text));
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

/*
 * #8154 (tester, v19 round, 29 Oct: two messages 7/7): the server's card had
 * already told the owner „<owner>, ვესაუბრე <H>-ის ასისტენტს და მითხრა, რომ …",
 * and the run's reply told it again before its question. The event says not to
 * repeat the answer, and the model repeats it anyway — so the server holds it:
 * a sentence of the reply that is mostly the card's own words comes off.
 */
const CARD_WORD_MIN_CHARS = 4;
/** Letters a word is compared by, so a case ending does not hide a repeat. */
const CARD_STEM_CHARS = 5;
/** A sentence this short says too little to call a repeat. */
const CARD_REPEAT_MIN_WORDS = 3;
/** The share of a sentence's words found on the card that makes it a repeat. */
const CARD_REPEAT_SHARE = 0.6;
const CARD_SENTENCE_SPLIT_RE = /((?<=[.!?…])\s+|\n+)/u;
const CARD_WORD_RE = /[\p{L}\p{N}]+/gu;

function cardStems(text: string): string[] {
  return (text.toLowerCase().match(CARD_WORD_RE) ?? [])
    .filter((w) => w.length >= CARD_WORD_MIN_CHARS)
    .map((w) => w.slice(0, CARD_STEM_CHARS));
}

function repeatsCard(sentence: string, card: ReadonlySet<string>): boolean {
  const stems = cardStems(sentence);
  if (stems.length < CARD_REPEAT_MIN_WORDS) return false;
  const onCard = stems.filter((s) => card.has(s)).length;
  return onCard / stems.length >= CARD_REPEAT_SHARE;
}

/**
 * Pure: the reply without the sentences that retell the card, or null when it
 * retold nothing. A reply that was nothing but the card keeps its last sentence,
 * so the owner is never left with an empty turn.
 */
export function withoutCardRepeat(reply: string, cardText: string): string | null {
  const card = new Set(cardStems(cardText));
  if (card.size === 0) return null;
  const parts = reply.trim().split(CARD_SENTENCE_SPLIT_RE);
  const kept: string[] = [];
  let dropped = false;
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    if (sentence.trim() !== '' && repeatsCard(sentence, card)) {
      dropped = true;
      continue;
    }
    kept.push(sentence + (parts[i + 1] ?? ''));
  }
  if (!dropped) return null;
  const rest = kept.join('').trim();
  if (rest !== '') return rest;
  const sentences = parts.filter((_, i) => i % 2 === 0 && parts[i].trim() !== '');
  return sentences[sentences.length - 1].trim();
}
