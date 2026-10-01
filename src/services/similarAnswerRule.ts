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

/** The reply, opening with the line that the answer went when it does not say so. */
export function withAnswerSentLine(reply: string, language: RunLanguage): string {
  if (SAYS_IT_WENT_RE.test(reply)) return reply;
  const line = ANSWER_SENT_LINE[language] ?? ANSWER_SENT_LINE.ka;
  return reply.trim() === '' ? line : `${line} ${reply.trimStart()}`;
}
