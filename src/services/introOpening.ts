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

/**
 * The third message the introduction writes, and the last one that was still
 * Georgian on every account: what the TARGET reads when the mediator says yes.
 *
 * It carries the number-disclosure sentence, which is the part that must be
 * right in whatever language the reader has — it is the sentence that tells
 * somebody their phone number has left the mediator's phonebook.
 */
export function introAcceptedTitle(language: RunLanguage, requesterName: string): string {
  switch (language) {
    case 'en':
      return `Introduction: ${requesterName}`;
    case 'ru':
      return `Знакомство: ${requesterName}`;
    case 'es':
      return `Presentación: ${requesterName}`;
    default:
      return `გაცნობა: ${requesterName}`;
  }
}

/**
 * Item 5's whole point, in the reader's language: whether a number was handed
 * over, said plainly, because saying yes to an introduction is what hands it
 * over and nobody should learn that afterwards.
 */
export function numberDisclosureLine(
  language: RunLanguage,
  numberWasGiven: boolean,
  mediatorName: string,
  requesterName: string,
): string {
  if (!numberWasGiven) {
    switch (language) {
      case 'en':
        return (
          'Your number has not been passed to anybody — ' +
          `${requesterName} has to ask ${mediatorName} for your contact.`
        );
      case 'ru':
        return (
          'Твой номер никому не передан — ' +
          `${requesterName} должен попросить твой контакт у ${mediatorName}.`
        );
      case 'es':
        return (
          'Tu número no se ha dado a nadie — ' +
          `${requesterName} tiene que pedirle tu contacto a ${mediatorName}.`
        );
      default:
        return (
          'შენი ნომერი არავის გადაცემია — ' +
          `${geoName(requesterName, 'dat')} შენი კონტაქტი ${geoName(mediatorName, 'dat')} უნდა სთხოვოს.`
        );
    }
  }
  switch (language) {
    case 'en':
      return (
        `${mediatorName} passed your number to ${requesterName} from their own phonebook — ` +
        'that is what saying yes to an introduction means. If you would rather not get ' +
        'questions through Netai, tell me and I will stop them.'
      );
    case 'ru':
      return (
        `${mediatorName} передал твой номер ${requesterName} из своей записной книжки — ` +
        'согласие на знакомство означает именно это. Если не хочешь получать вопросы через ' +
        'Netai, скажи, и я это прекращу.'
      );
    case 'es':
      return (
        `${mediatorName} le ha dado tu número a ${requesterName} desde su propia agenda — ` +
        'eso es lo que significa aceptar una presentación. Si prefieres no recibir preguntas ' +
        'por Netai, dímelo y lo detengo.'
      );
    default:
      return (
        `შენი ნომერი ${geoName(mediatorName, 'erg')} თავისი წიგნაკიდან ${geoName(requesterName, 'dat')} ` +
        'გადასცა — გაცნობაზე თანხმობა სწორედ ამას ნიშნავს. თუ არ გინდა, რომ Netai-ს გავლით კითხვები ' +
        'მოგდიოდეს, მითხარი და შევაჩერებ.'
      );
  }
}

/** „X said yes: Y would like to meet you." */
export function introAcceptedOpening(
  language: RunLanguage,
  mediatorName: string,
  requesterName: string,
  reason: string | null,
  numberWasGiven: boolean,
): string {
  const why = (label: string): string => (reason ? ` — ${label} „${reason}"` : '.');
  const disclosure = numberDisclosureLine(language, numberWasGiven, mediatorName, requesterName);
  switch (language) {
    case 'en':
      return (
        `${mediatorName} said yes to an introduction: **${requesterName}** would like to meet you` +
        why('their reason:') +
        `\n\nThey may get in touch soon — they know ${mediatorName} introduced you. ` +
        disclosure
      );
    case 'ru':
      return (
        `${mediatorName} согласился познакомить: **${requesterName}** хочет с тобой познакомиться` +
        why('причина:') +
        `\n\nВозможно, скоро свяжется — он знает, что вас познакомил ${mediatorName}. ` +
        disclosure
      );
    case 'es':
      return (
        `${mediatorName} ha aceptado presentarte: **${requesterName}** quiere conocerte` +
        why('su motivo:') +
        `\n\nPuede que te escriba pronto — sabe que ${mediatorName} os ha presentado. ` +
        disclosure
      );
    default:
      return (
        `${geoName(mediatorName, 'erg')} გაცნობის თანხმობა გასცა: **${requesterName}**-ს შენი გაცნობა უნდა` +
        why('მიზეზი:') +
        `\n\nშესაძლოა მალე დაგიკავშირდეს — ეცოდინება, რომ ${geoName(mediatorName, 'erg')} გაგაცნოთ. ` +
        disclosure
      );
  }
}

/** The same news on a lock screen. */
export function introAcceptedPush(
  language: RunLanguage,
  mediatorName: string,
  requesterName: string,
): { title: string; body: string } {
  switch (language) {
    case 'en':
      return {
        title: 'Netai — introduction',
        body: `${mediatorName} introduced you to ${requesterName}. Open Netai.`,
      };
    case 'ru':
      return {
        title: 'Netai — знакомство',
        body: `${mediatorName} познакомил тебя с ${requesterName}. Открой Netai.`,
      };
    case 'es':
      return {
        title: 'Netai — presentación',
        body: `${mediatorName} te ha presentado a ${requesterName}. Abre Netai.`,
      };
    default:
      return {
        title: 'Netai — გაცნობა',
        body: `${mediatorName}-მ გაგაცნო ${geoName(requesterName, 'dat')}. გახსენი Netai.`,
      };
  }
}

/**
 * The two captions the introduction writes onto a thread once it moves —
 * snoozed on the mediator's side, answered on the requester's.
 *
 * They were the last Georgian left in this flow and they were invisible until
 * 20 September, when the client started drawing `status_line` instead of its
 * own generic label. The messages and titles beside them have been in the
 * reader's language since `0529540`; these had not, so a mediator reading
 * English would have had „გადადებულია" under an English thread.
 */
export function introSnoozedLine(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return 'Put off for now';
    case 'ru':
      return 'Отложено';
    case 'es':
      return 'Aplazado';
    default:
      return 'გადადებულია';
  }
}

export function introAnsweredLine(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return 'They have answered';
    case 'ru':
      return 'Ответ пришёл';
    case 'es':
      return 'Han respondido';
    default:
      return 'პასუხი მოვიდა';
  }
}

/**
 * The three buttons a mediator is offered when they accept without saying HOW,
 * and the refusal that asks for them.
 *
 * Caught on a pre-flight read at 13:05 on 20 September, minutes before the
 * seat was due to answer the first introduction in fourteen days — as an
 * English-speaking mediator.
 *
 * The refusal is model-facing, which by itself is fine: a model reads Georgian.
 * What is NOT fine is that it names the exact BUTTON LABELS the model must put
 * on the person's screen — „პირდაპირ დააკავშირე" / „ჩემი გავლით" /
 * „არა, ამჯერად" — so a mediator who writes English would have been handed
 * three Georgian buttons and asked to choose whether to give away somebody's
 * phone number.
 *
 * This product has been bitten by a Georgian button in an English thread
 * before, and it was not cosmetic then either: an unrecognised approve label
 * made `approvalBelongsToThePlan` false and the owner's yes had nowhere to
 * land (see approveWording.test.ts). Here the stakes are a phone number.
 *
 * The whole refusal is localised rather than only the labels, so the prose and
 * the buttons cannot drift apart — which is how the plan card ended up telling
 * the model to offer a word the product had stopped using.
 */
export function introChannelRequired(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return (
        'Ask the user HOW they want the introduction made, then call me again with `channel`. ' +
        'There are two and the choice is theirs: `direct` — the two of them contact each other ' +
        'and the other side is given the contact; `via_mediator` — the contact is given to ' +
        'nobody and it keeps going through them. Offer three buttons with present_choices: ' +
        '"Connect us directly" / "Keep it through me" / "No, not this time". ' +
        'Nothing has been recorded yet — nothing is lost, just ask and call me again.'
      );
    case 'ru':
      return (
        'Спроси пользователя, КАК он хочет познакомить, и вызови меня снова с `channel`. ' +
        'Вариантов два, и выбор его: `direct` — они свяжутся напрямую и другой стороне ' +
        'передаётся контакт; `via_mediator` — контакт никому не передаётся и связь идёт через ' +
        'него. Покажи три кнопки через present_choices: «Свяжите напрямую» / «Через меня» / ' +
        '«Нет, не сейчас». Согласие ещё не записано — ничего не потеряно, просто спроси и ' +
        'вызови снова.'
      );
    case 'es':
      return (
        'Pregunta al usuario CÓMO quiere hacer la presentación y vuelve a llamarme con ' +
        '`channel`. Hay dos y la decisión es suya: `direct` — se ponen en contacto directamente ' +
        'y a la otra parte se le da el contacto; `via_mediator` — el contacto no se da a nadie ' +
        'y todo sigue pasando por él. Muestra tres botones con present_choices: ' +
        '"Conectadnos directamente" / "Que pase por mí" / "No, esta vez no". ' +
        'Nada se ha registrado todavía — no se pierde nada, pregunta y vuelve a llamarme.'
      );
    default:
      return (
        'ჯერ ჰკითხე მომხმარებელს, როგორ სურს გაცნობა, და მერე დამიძახე ისევ `channel`-ით. ' +
        'ორი ვარიანტია და არჩევანი მისია: `direct` — ორივე პირდაპირ დაუკავშირდება ერთმანეთს ' +
        'და მეორე მხარეს კონტაქტი გადაეცემა; `via_mediator` — კონტაქტი არავის გადაეცემა და ' +
        'კავშირი მის გავლით გაგრძელდება. present_choices-ით აჩვენე სამი ღილაკი: ' +
        '„პირდაპირ დააკავშირე" / „ჩემი გავლით" / „არა, ამჯერად". ' +
        'თანხმობა ჯერ არ ჩაწერილა — არაფერი დაკარგულა, უბრალოდ ჰკითხე და დამიძახე.'
      );
  }
}
