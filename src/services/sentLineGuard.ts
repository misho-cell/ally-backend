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
  [SentSide.Mediator]:
    /^\s*(?:done|готово|hecho|listo|მზადაა)\b|connected|connecting|დაუკავშირ|დააკავშირ|დაკავშირდებ|соедин|conectad/i,
  [SentSide.Asker]:
    /Netai-ს (?:შემდეგ )?გახსნისას|გახსნისას (?:ნახავს|დაინახავს)|შეტყობინებები (?:აქვს )?გამორთ|notifications (?:are )?(?:off|turned off|disabled)|opens? Netai|откроет Netai|уведомления|abra Netai|notificaciones/i,
};

function restatesTheServerLine(sentence: string, side: SentSide): boolean {
  return SAYS_IT_WENT_RE.test(sentence) || SIDE_RESTATEMENT_RE[side].test(sentence);
}

/** Sentence ends, kept by the split so a paragraph break survives a dropped sentence. */
const SENTENCE_END_RE = /((?<=[.!?…])\s+)/;

/**
 * When a reply was nothing but the restatement, one line in its place — never
 * a second „sent", and never the empty reply the run would report as failed.
 */
const IN_PLACE_OF_A_REPEAT: Readonly<Record<SentSide, Readonly<Record<RunLanguage, string>>>> = {
  [SentSide.Asker]: {
    ka: 'როგორც კი პასუხი მოვა, მაშინვე გეტყვი.',
    en: 'I will tell you the moment the answer comes.',
    ru: 'Как только придёт ответ, сразу скажу.',
    es: 'Te lo diré en cuanto llegue la respuesta.',
  },
  [SentSide.Mediator]: {
    ka: 'თუ კიდევ რამე დაგჭირდება, აქ ვარ.',
    en: 'If you need anything else, I am here.',
    ru: 'Если что-то ещё понадобится, я здесь.',
    es: 'Si necesitas algo más, aquí estoy.',
  },
};

/**
 * #1750 (tester 40789, conv 40496): the go-between typed her refusal, the
 * server wrote its close, and the reply held only her own sentence, word for
 * word, as if Netai had said it. A sentence of the reply that is the owner's
 * own line from this turn says nothing new to them.
 */
const MIN_ECHO_LETTERS = 12;
const NOT_A_LETTER_RE = /[^\p{L}\p{N}]+/gu;

function letters(text: string): string {
  return text.toLowerCase().replace(NOT_A_LETTER_RE, '');
}

function echoesTheOwner(sentence: string, ownersLine: string): boolean {
  const said = letters(sentence);
  return said.length >= MIN_ECHO_LETTERS && letters(ownersLine).includes(said);
}

/** The reply without the sentences that repeat a line the server already wrote. */
export function withoutSentRestatement(
  reply: string,
  side: SentSide,
  language: RunLanguage,
  ownersLine = '',
): string {
  const pieces = reply.trim().split(SENTENCE_END_RE);
  let rest = '';
  let dropped = false;
  for (let i = 0; i < pieces.length; i += 2) {
    const sentence = pieces[i] ?? '';
    if (restatesTheServerLine(sentence, side) || echoesTheOwner(sentence, ownersLine)) {
      dropped = true;
      continue;
    }
    rest += sentence + (pieces[i + 1] ?? '');
  }
  if (!dropped) return reply;
  if (rest.trim() !== '') return rest.trim();
  const lines = IN_PLACE_OF_A_REPEAT[side];
  return lines[language] ?? lines.ka;
}
