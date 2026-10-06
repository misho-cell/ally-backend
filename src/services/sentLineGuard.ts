import { RunLanguage } from './runLanguage';

/**
 * PLATE v301 G5 — „SENT" ARRIVED TWICE, ON BOTH SIDES.
 *
 * The tester's 992: the asker's thread got the server's line („the request
 * has gone to X… they will see it and reply 😊") at 21:59:56, and the model's
 * own „sent" seventeen seconds later. The mediator's thread got the server's
 * close („thank you, your yes was passed on") at 22:03:02 and the model's
 * „გადაცემულია…" six seconds later.
 *
 * The server's line is the record — deterministic, and already on the
 * screen. So when the server wrote it into THIS run's thread, the reply's
 * own restatement goes: every sentence of it that only says the thing went
 * or was passed on. Whatever else the reply says stays.
 */

/** Which side of an introduction the run's thread is on. */
export enum SentSide {
  Asker = 'asker',
  Mediator = 'mediator',
}

/** Words a sentence uses to say a request or an answer went, or was passed on. */
const SAYS_IT_WENT_RE =
  /გაიგზავნ|გაეგზავნ|გავუგზავნ|გავაგზავნ|გაგზავნილია|გადავეც|გადაეც|გადაცემულია|\bsent\b|passed (?:it )?on|forwarded|отправ|передал|передан|enviad|transmit/i;

/**
 * The tester's 995 / 996: each side's server line says more than „sent", and
 * the reply restated THAT part in other words.
 *
 * Mediator: the close says the two will be connected; the reply said „Done,
 * they'll be connected directly." Asker: the line says the mediator „will see
 * it when they open Netai"; the reply repeated it and added the mediator's
 * notification setting, which is not the owner's to hear.
 */
const SIDE_RESTATEMENT_RE: Readonly<Record<SentSide, RegExp>> = {
  // #1750 (tester 40921): „გაცნობის მოთხოვნას დავთანხმდი" — her yes, restated as Netai's own.
  [SentSide.Mediator]:
    /^\s*(?:done|готово|hecho|listo|მზადაა)\b|connected|connecting|დაუკავშირ|დააკავშირ|დაკავშირდებ|соедин|conectad|დავთანხმდ|დაეთანხმ|თანხმობა|\bagreed\b|\baccepted\b|согласи|aceptad/i,
  [SentSide.Asker]:
    /Netai-ს (?:შემდეგ )?გახსნისას|გახსნისას (?:ნახავს|დაინახავს)|შეტყობინებები (?:აქვს )?გამორთ|notifications (?:are )?(?:off|turned off|disabled)|opens? Netai|откроет Netai|уведомления|abra Netai|notificaciones/i,
};

function restatesTheServerLine(sentence: string, side: SentSide): boolean {
  return SAYS_IT_WENT_RE.test(sentence) || SIDE_RESTATEMENT_RE[side].test(sentence);
}

/** Sentence ends, kept by the split so a paragraph break survives a dropped sentence. */
const SENTENCE_END_RE = /((?<=[.!?…])\s+)/;

/**
 * When an asker's reply was nothing but the restatement, one line in its place
 * — never a second „sent", and never the empty reply the run would report as
 * failed. The go-between's side gets nothing: the server's close is the whole
 * answer there, and the tester's 40921 read „if you need anything else, I am
 * here" under it as one line too many.
 */
const IN_PLACE_OF_A_REPEAT: Readonly<Record<RunLanguage, string>> = {
  ka: 'როგორც კი პასუხი მოვა, მაშინვე გეტყვი.',
  en: 'I will tell you the moment the answer comes.',
  ru: 'Как только придёт ответ, сразу скажу.',
  es: 'Te lo diré en cuanto llegue la respuesta.',
};

/**
 * #1750 (tester 40789, conv 40496): the go-between typed her refusal, the
 * server wrote its close, and the reply held only her own sentence, word for
 * word, as if Netai had said it. A sentence of the reply that is one of the
 * owner's own recent lines says nothing new to them — 40921: the condition she
 * typed a turn before tapping the channel button came back the same way.
 */
const MIN_ECHO_LETTERS = 12;
const NOT_A_LETTER_RE = /[^\p{L}\p{N}]+/gu;

function letters(text: string): string {
  return text.toLowerCase().replace(NOT_A_LETTER_RE, '');
}

function echoesTheOwner(sentence: string, ownersLines: readonly string[]): boolean {
  const said = letters(sentence);
  return (
    said.length >= MIN_ECHO_LETTERS && ownersLines.some((line) => letters(line).includes(said))
  );
}

/** The reply without the sentences that repeat a line the server already wrote. */
export function withoutSentRestatement(
  reply: string,
  side: SentSide,
  language: RunLanguage,
  ownersLines: readonly string[] = [],
): string {
  const pieces = reply.trim().split(SENTENCE_END_RE);
  let rest = '';
  let dropped = false;
  for (let i = 0; i < pieces.length; i += 2) {
    const sentence = pieces[i] ?? '';
    if (restatesTheServerLine(sentence, side) || echoesTheOwner(sentence, ownersLines)) {
      dropped = true;
      continue;
    }
    rest += sentence + (pieces[i + 1] ?? '');
  }
  if (!dropped) return reply;
  if (rest.trim() !== '') return rest.trim();
  if (side === SentSide.Mediator) return '';
  return IN_PLACE_OF_A_REPEAT[language] ?? IN_PLACE_OF_A_REPEAT.ka;
}

/**
 * #1783 (tester 41021): word lists lost twice — „დავთანხმდი" was caught, so the
 * next run wrote „დავუდასტურე"; the filler went, so „უარი ვაცნობე" came. On the
 * go-between's side the server's close says everything her answer did. The run
 * speaks after it only when she asked something in the same turn.
 */
const ASKS_SOMETHING_RE = /[?？]/;

export function closeLineIsTheWholeAnswer(side: SentSide, ownersMessage: string): boolean {
  return side === SentSide.Mediator && !ASKS_SOMETHING_RE.test(ownersMessage);
}
