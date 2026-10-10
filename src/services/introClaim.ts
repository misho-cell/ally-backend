import { RunLanguage } from './runLanguage';
import { NotDeletedLine } from './deletionClaim';

/**
 * 4258 (box 50524, goal conv 48945): „გამაცანი თამთა … ბახვას მეშვეობით" was
 * answered twice „გაცნობის მოთხოვნა გავგზავნე" / „ახლა გავუგზავნე" with no
 * tool called, and the go-between had no request. The unsent-instruction guard
 * reads only a conversation that has sent nothing, and this one had already
 * asked three people. Like 3302's „deleted" and 3796's „saved": a reply may say
 * an introduction request went only when request_introduction succeeded in
 * that run. Otherwise the owner reads the truth with a button to confirm, and
 * the next run makes the request the ordinary way.
 *
 * On, on Misho's yes to the exact lines below (§125).
 */
export const INTRO_CLAIM_GUARD_ON = true;

const REQUEST_WORDS = '(?:გაცნობის\\s+(?:მო)?თხოვნ\\p{L}*|introduction\\s+request)';
const SENT_WORDS =
  '(?:გავგზავნე|გავუგზავნე|გავაგზავნე|გადავუგზავნე|გაიგზავნა|sent|made|passed\\s+on)';
const NOT_BEFORE = "(?<!(?:არ|ვერ|not|n't)\\s)";
/** Up to a few words between the two halves („… ახლა გავუგზავნე"), within one sentence. */
const BETWEEN = '[^.!?\\n]{0,40}?';

const CLAIMS_INTRO_SENT_RE = new RegExp(
  `${REQUEST_WORDS}${BETWEEN}${NOT_BEFORE}${SENT_WORDS}(?![\\p{L}\\p{M}])` +
    `|(?<![\\p{L}\\p{M}])${NOT_BEFORE}${SENT_WORDS}${BETWEEN}${REQUEST_WORDS}`,
  'iu',
);

/** The reply says an introduction request went, and none went in this run. */
export function introClaimWithoutSend(reply: string, introSentThisRun: boolean): boolean {
  return !introSentThisRun && CLAIMS_INTRO_SENT_RE.test(reply);
}

const NOT_SENT: Readonly<Record<RunLanguage, NotDeletedLine>> = {
  ka: {
    text: 'გაცნობის თხოვნა ჯერ არ გამიგზავნია. დამიდასტურე და ახლავე გავაგზავნი.',
    confirm: 'კი, გააგზავნე',
  },
  en: {
    text: 'I have not sent the introduction request yet. Confirm and I will send it now.',
    confirm: 'Yes, send it',
  },
  ru: {
    text: 'Я ещё не отправил просьбу о знакомстве. Подтверди, и я отправлю её сейчас.',
    confirm: 'Да, отправь',
  },
  es: {
    text: 'Todavía no he enviado la solicitud de presentación. Confírmalo y la envío ahora.',
    confirm: 'Sí, envíala',
  },
};

export function introNotSentLine(language: RunLanguage): NotDeletedLine {
  return NOT_SENT[language] ?? NOT_SENT.ka;
}
