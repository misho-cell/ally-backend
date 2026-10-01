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

/** The reply without the sentences that repeat a line the server already wrote. */
export function withoutSentRestatement(
  reply: string,
  side: SentSide,
  language: RunLanguage,
): string {
  const pieces = reply.trim().split(SENTENCE_END_RE);
  let rest = '';
  let dropped = false;
  for (let i = 0; i < pieces.length; i += 2) {
    const sentence = pieces[i] ?? '';
    if (SAYS_IT_WENT_RE.test(sentence)) {
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
