import { RunLanguage } from './runLanguage';

/**
 * WHAT IS SAID AFTER AN ANSWER GOES TO THE PERSON WHO ASKED.
 *
 * D562 (Tornike, 1 October; amends D527): the „answer similar ones like this"
 * button is removed from the app, and with it the path that saved a standing
 * rule on its tap. After a typed answer goes, only „პასუხი გაიგზავნა." stays.
 * A send never writes a rule (row 302).
 */
/**
 * The tester's 962: after the send, the reply said only „თუ გსურს, შეგიძლია
 * აირჩიო." — never that the answer went. D527 is one line saying it went, so
 * the server says it when the reply did not.
 */
export const ANSWER_SENT_LINE: Readonly<Record<RunLanguage, string>> = {
  ka: 'პასუხი გაიგზავნა.',
  en: 'Your answer was sent.',
  ru: 'Ответ отправлен.',
  es: 'Tu respuesta fue enviada.',
};

/** Words a reply uses when it already says the answer went. */
const SAYS_IT_WENT_RE = /გაიგზავნ|გაეგზავნ|გავუგზავნ|გავაგზავნ|გაგზავნილია|\bsent\b|отправ|enviad/i;

/**
 * The tester's 1102 (E4, 32969): a helper answered „I don't know" and the whole
 * reply was „პასუხი გაიგზავნა." — the line alone, with no word of thanks to a
 * person who took the time to answer. When the line IS the reply, it thanks.
 */
const THANKS_AND_SENT: Readonly<Record<RunLanguage, string>> = {
  ka: 'მადლობა, პასუხი გაიგზავნა.',
  en: 'Thank you — your answer was sent.',
  ru: 'Спасибо, ответ отправлен.',
  es: 'Gracias, tu respuesta fue enviada.',
};

/** The reply, opening with the line that the answer went when it does not say so. */
/** A reply that is nothing but the bare line, in any of our languages. */
function isOnlyTheBareLine(reply: string): boolean {
  const trimmed = reply.trim();
  return Object.values(ANSWER_SENT_LINE).some((line) => line === trimmed);
}

export function withAnswerSentLine(reply: string, language: RunLanguage): string {
  // The tester's 1103 (33157): the model itself wrote the bare „პასუხი გაიგზავნა.",
  // so the empty-reply branch never ran and the helper still got no thanks.
  if (reply.trim() === '' || isOnlyTheBareLine(reply)) {
    return THANKS_AND_SENT[language] ?? THANKS_AND_SENT.ka;
  }
  if (SAYS_IT_WENT_RE.test(reply)) return reply;
  const line = ANSWER_SENT_LINE[language] ?? ANSWER_SENT_LINE.ka;
  return `${line} ${reply.trimStart()}`;
}

/** Every form the line takes, bare or with thanks, in our languages. */
export const ANSWER_SENT_FORMS: readonly string[] = [
  ...Object.values(ANSWER_SENT_LINE),
  ...Object.values(THANKS_AND_SENT),
];

/**
 * #6766 (Giorgi, helper's screen 20 Oct): „მადლობა, პასუხი გაიგზავნა." stood
 * under every reply the helper wrote. It is said once in a conversation: when
 * it was already said, the reply goes as it is — and a reply that would be
 * nothing but the line becomes empty, so the run ends quietly.
 */
export function withAnswerSentLineOnce(
  reply: string,
  language: RunLanguage,
  alreadySaid: boolean,
): string {
  if (!alreadySaid) return withAnswerSentLine(reply, language);
  const trimmed = reply.trim();
  return trimmed === '' || isOnlyTheBareLine(trimmed) ? '' : reply;
}
