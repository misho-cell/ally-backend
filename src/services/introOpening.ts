import { RunLanguage } from './runLanguage';
import { geoName } from './georgianCase';

/**
 * The two threads an introduction creates, in the language of the person who
 * reads each one.
 *
 * The ask wrapper was localised on 19 September and this was named in the same
 * breath as still Georgian — the seat's 290 had already sighted it there, and
 * called the introduction „the single most important message this product
 * sends", which is right: it is the one where a stranger decides whether to
 * put their name behind you.
 *
 * Every word of both threads was hardcoded Georgian. Not only the sentences:
 * THE TITLE TOO, which is what an English account sees in its sidebar without
 * opening anything.
 *
 * It is not a table of strings to swap, for the same reason the ask wrapper
 * was not. The Georgian is built out of names INFLECTED — „ნინიას", „გიოსთვის"
 * — and no other language here has anything to inflect. So each language gets
 * its own construction around a bare name and Georgian keeps `geoName`.
 *
 * THE LANGUAGE IS EACH READER'S OWN, and the two readers can differ. The
 * mediator may write English and the requester Georgian; they get one thread
 * each, in their own. Both threads are created empty in the same breath as
 * this text, so there is nothing in them to read — the reader's own words
 * elsewhere are the only evidence there is. See `userLanguage`.
 */

/** „X → you" in the mediator's sidebar, or „X → Y". */
export function incomingRequestTitle(
  language: RunLanguage,
  requesterName: string,
  targetName: string,
  direct: boolean,
): string {
  if (!direct) return `${requesterName} → ${targetName}`;
  switch (language) {
    case 'en':
      return `${requesterName} → you`;
    case 'ru':
      return `${requesterName} → тебе`;
    case 'es':
      return `${requesterName} → tú`;
    default:
      return `${requesterName} → შენ`;
  }
}

/**
 * What the mediator — or, in the direct case, the target — reads first.
 *
 * `direct` is task 18's distinction and it is not cosmetic: the reader IS the
 * person being introduced, so „X wants you to introduce them to Y" would be
 * asking somebody to introduce a stranger to themselves (live row #793).
 */
export function incomingRequestOpening(
  language: RunLanguage,
  requesterName: string,
  targetName: string,
  message: string | null,
  direct: boolean,
): string {
  const quoted = (label: string): string => (message ? `\n\n${label} _"${message}"_` : '');
  switch (language) {
    case 'en':
      return direct
        ? `Hello! **${requesterName}** would like to meet you.` +
            quoted('Their message:') +
            `\n\nWill you say yes?`
        : `Hello! **${requesterName}** is asking you to introduce them to **${targetName}**.` +
            quoted('Their message:') +
            `\n\nWill you help? 🤝`;
    case 'ru':
      return direct
        ? `Привет! **${requesterName}** хочет с тобой познакомиться.` +
            quoted('Его сообщение:') +
            `\n\nСоглашаешься?`
        : `Привет! **${requesterName}** просит познакомить его с **${targetName}**.` +
            quoted('Его сообщение:') +
            `\n\nПоможешь? 🤝`;
    case 'es':
      return direct
        ? `¡Hola! **${requesterName}** quiere conocerte.` + quoted('Su mensaje:') + `\n\n¿Aceptas?`
        : `¡Hola! **${requesterName}** te pide que le presentes a **${targetName}**.` +
            quoted('Su mensaje:') +
            `\n\n¿Le ayudas? 🤝`;
    default:
      return direct
        ? `გამარჯობა! **${geoName(requesterName, 'dat')}** შენი გაცნობა უნდა.` +
            quoted('მისი შეტყობინება:') +
            `\n\nდათანხმდები?`
        : `გამარჯობა! **${requesterName}** გთხოვს, გააცნო **${geoName(targetName, 'dat')}**.` +
            quoted('მისი შეტყობინება:') +
            `\n\nდაეხმარები? 🤝`;
  }
}

/** „Introduction: Y" in the requester's sidebar, or „X → Y". */
export function outgoingRequestTitle(
  language: RunLanguage,
  mediatorName: string,
  targetName: string,
  direct: boolean,
): string {
  if (!direct) return `${mediatorName} → ${targetName}`;
  switch (language) {
    case 'en':
      return `Introduction: ${targetName}`;
    case 'ru':
      return `Знакомство: ${targetName}`;
    case 'es':
      return `Presentación: ${targetName}`;
    default:
      return `გაცნობა: ${targetName}`;
  }
}

/** What the requester reads while they wait. */
export function outgoingRequestOpening(
  language: RunLanguage,
  mediatorName: string,
  targetName: string,
  direct: boolean,
): string {
  switch (language) {
    case 'en':
      return direct
        ? `**${targetName}** has been sent your introduction request.\n\n` +
            `They will see it next time they open Netai and get back to you. 😊`
        : `Your request to be introduced to **${targetName}** has gone to **${mediatorName}**.\n\n` +
            `**${mediatorName}** will see it next time they open Netai and reply. 😊`;
    case 'ru':
      return direct
        ? `**${targetName}** отправлен твой запрос на знакомство.\n\n` +
            `Увидит при следующем входе в Netai и ответит тебе. 😊`
        : `Запрос на знакомство с **${targetName}** отправлен **${mediatorName}**.\n\n` +
            `**${mediatorName}** увидит его при следующем входе в Netai и ответит. 😊`;
    case 'es':
      return direct
        ? `Se ha enviado tu solicitud de presentación a **${targetName}**.\n\n` +
            `La verá la próxima vez que abra Netai y te responderá. 😊`
        : `Tu solicitud para conocer a **${targetName}** ha llegado a **${mediatorName}**.\n\n` +
            `**${mediatorName}** la verá la próxima vez que abra Netai y responderá. 😊`;
    default:
      return direct
        ? `**${geoName(targetName, 'dat')}** გაეგზავნა შენი გაცნობის თხოვნა.\n\n` +
            `Netai-ს გახსნისას ნახავს და გიპასუხებს. 😊`
        : `**${geoName(mediatorName, 'gen')}თვის** გაიგზავნა გაცნობის მოთხოვნა ` +
            `**${geoName(targetName, 'on')}**.\n\n` +
            `**${mediatorName}** Netai-ს შემდეგ გახსნისას ნახავს და გიპასუხებს. 😊`;
  }
}
