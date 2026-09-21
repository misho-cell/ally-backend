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

/**
 * The rest of what an introduction says once the mediator has answered — the
 * REQUESTER's outcome line and the MEDIATOR's closing line.
 *
 * Found by reading ahead on 20 September while the seat was mid-test, after
 * the same read caught three Georgian buttons. The target's side was localised
 * in the morning; these two sides were not, and they are the substance of
 * item 5 — one of them carries an actual phone number.
 *
 * Three readers, three languages, none of them required to share one.
 */
export function introOutcomeLine(
  language: RunLanguage,
  targetName: string,
  accepted: boolean,
  direct: boolean,
  response: string | null,
): string {
  const quoted = (label: string): string => (response ? `\n\n${label} „${response}"` : '');
  if (accepted) {
    switch (language) {
      case 'en':
        return direct
          ? `${targetName} said yes.${quoted('Their answer:')} You can write to them now — they know who you are and why.`
          : `Your introduction request to ${targetName} has been accepted.${quoted('The answer:')}`;
      case 'ru':
        return direct
          ? `${targetName} согласился.${quoted('Ответ:')} Теперь можешь написать — он знает, кто ты и зачем.`
          : `Запрос на знакомство с ${targetName} принят.${quoted('Ответ:')}`;
      case 'es':
        return direct
          ? `${targetName} ha dicho que sí.${quoted('Su respuesta:')} Ya puedes escribirle — sabe quién eres y por qué.`
          : `Tu solicitud de presentación a ${targetName} ha sido aceptada.${quoted('La respuesta:')}`;
      default:
        return direct
          ? `${targetName} დათანხმდა გაცნობას.${quoted('პასუხი:')} ახლა თავისუფლად შეგიძლია მისწერო — იცის ვინ ხარ და რატომ.`
          : `${geoName(targetName, 'on')} გაცნობის მოთხოვნა მიღებულია.${quoted('პასუხი:')}`;
    }
  }
  switch (language) {
    case 'en':
      return direct
        ? `${targetName} has said no for now.${quoted('Their answer:')} Shall we find another way?`
        : `The introduction to ${targetName} was declined for now — the mediator could not help.${quoted('The answer:')} Shall we find another way?`;
    case 'ru':
      return direct
        ? `${targetName} пока отказался.${quoted('Ответ:')} Поищем другой путь?`
        : `По знакомству с ${targetName} пока отказ — посредник не смог помочь.${quoted('Ответ:')} Поищем другой путь?`;
    case 'es':
      return direct
        ? `${targetName} ha dicho que no por ahora.${quoted('Su respuesta:')} ¿Buscamos otra vía?`
        : `La presentación a ${targetName} ha sido rechazada por ahora — el intermediario no pudo ayudar.${quoted('La respuesta:')} ¿Buscamos otra vía?`;
    default:
      return direct
        ? `${geoName(targetName, 'erg')} გაცნობაზე ამჯერად უარი თქვა.${quoted('პასუხი:')} სხვა გზა მოვძებნოთ?`
        : `${geoName(targetName, 'on')} გაცნობის მოთხოვნაზე ამჯერად უარი მოვიდა — შუამავალმა ვერ დაგეხმარა.${quoted('პასუხი:')} სხვა გზა მოვძებნოთ?`;
  }
}

/** What the REQUESTER is told after a mediated accept, per channel. */
export function introRequesterExtra(
  language: RunLanguage,
  mediatorName: string,
  targetName: string,
  targetPhone: string | null,
  viaMediator: boolean,
  targetWasTold: boolean,
): string {
  if (viaMediator) {
    switch (language) {
      case 'en':
        return (
          `\n\n${mediatorName} chose to keep the connection going through them — no number was ` +
          `passed on, and that is their decision rather than a fault. Tell me what you want ` +
          `${targetName} to hear and I will pass it to ${mediatorName}.`
        );
      case 'ru':
        return (
          `\n\n${mediatorName} решил, что связь пойдёт через него — номер не передан, и это его ` +
          `решение, а не сбой. Напиши, что передать ${targetName}, и я передам ${mediatorName}.`
        );
      case 'es':
        return (
          `\n\n${mediatorName} ha decidido que el contacto siga pasando por él — no se ha dado ` +
          `ningún número, y es su decisión, no un fallo. Dime qué quieres que ${targetName} ` +
          `sepa y se lo paso a ${mediatorName}.`
        );
      default:
        return (
          `\n\n${geoName(mediatorName, 'erg')} აირჩია, რომ კავშირი მის გავლით გაგრძელდეს — ` +
          `ნომერი არ გადმოუციათ და ეს მისი გადაწყვეტილებაა, არა ხარვეზი. ` +
          `დამიწერე, რისი გადაცემა გინდა ${geoName(targetName, 'dat')}, და ${geoName(mediatorName, 'dat')} გადავცემ.`
        );
    }
  }
  if (targetPhone === null) {
    switch (language) {
      case 'en':
        return `\n\nI could not find the number automatically — ask ${mediatorName} for ${targetName}'s contact directly, you already have the yes.`;
      case 'ru':
        return `\n\nНомер автоматически не нашёлся — попроси контакт ${targetName} прямо у ${mediatorName}, согласие уже есть.`;
      case 'es':
        return `\n\nNo he podido encontrar el número automáticamente — pídele a ${mediatorName} el contacto de ${targetName} directamente, el sí ya lo tienes.`;
      default:
        return `\n\nნომერი ავტომატურად ვერ მოვძებნე — ${geoName(mediatorName, 'dat')} პირდაპირ ჰკითხე ${geoName(targetName, 'gen')} კონტაქტი, თანხმობა უკვე გაქვს.`;
    }
  }
  const told = (t: string): string => (targetWasTold ? t : '');
  switch (language) {
    case 'en':
      return (
        `\n\n${targetName}'s number, from ${mediatorName}'s phonebook: ${targetPhone}. ` +
        `Write to them and say ${mediatorName} introduced you` +
        told(' — they have already been told you may be in touch') +
        '.'
      );
    case 'ru':
      return (
        `\n\nНомер ${targetName} из записной книжки ${mediatorName}: ${targetPhone}. ` +
        `Напиши и скажи, что вас познакомил ${mediatorName}` +
        told(' — его уже предупредили, что ты можешь написать') +
        '.'
      );
    case 'es':
      return (
        `\n\nEl número de ${targetName}, de la agenda de ${mediatorName}: ${targetPhone}. ` +
        `Escríbele y dile que ${mediatorName} os ha presentado` +
        told(' — ya le hemos avisado de que podrías escribirle') +
        '.'
      );
    default:
      return (
        `\n\n${geoName(targetName, 'gen')} ნომერი ${geoName(mediatorName, 'gen')} წიგნაკიდან: ${targetPhone}. ` +
        `მისწერე და უთხარი, რომ ${geoName(mediatorName, 'erg')} გაგაცნოთ` +
        told(' — მას უკვე ვაცნობეთ, რომ შესაძლოა დაუკავშირდე') +
        '.'
      );
  }
}

/** The MEDIATOR's own closing line — what happened because they said yes. */
export function introMediatorFollowUp(
  language: RunLanguage,
  requesterName: string,
  targetName: string,
  targetPhone: string | null,
  viaMediator: boolean,
  targetWasTold: boolean,
): string {
  if (viaMediator) {
    switch (language) {
      case 'en':
        return `Thank you! I have told ${requesterName} that you said yes and that the connection keeps going through you. ${targetName}'s number was given to nobody.`;
      case 'ru':
        return `Спасибо! Я сказал ${requesterName}, что ты согласился и что связь идёт через тебя. Номер ${targetName} никому не передан.`;
      case 'es':
        return `¡Gracias! Le he dicho a ${requesterName} que aceptas y que el contacto sigue pasando por ti. El número de ${targetName} no se ha dado a nadie.`;
      default:
        return (
          `მადლობა! ${geoName(requesterName, 'dat')} ვაცნობე, რომ თანხმობა მოგვეცი და რომ ` +
          `კავშირი შენი გავლით გაგრძელდება. ${geoName(targetName, 'gen')} ნომერი არავის გადაეცა.`
        );
    }
  }
  const told = (t: string): string => (targetWasTold ? t : '');
  if (targetPhone === null) {
    switch (language) {
      case 'en':
        return `Thank you! I have told ${requesterName} you said yes. I could not find ${targetName}'s contact in your phonebook — ${requesterName} may ask you for it directly.`;
      case 'ru':
        return `Спасибо! Я сказал ${requesterName}, что ты согласился. Контакт ${targetName} в твоей записной книжке не нашёлся — ${requesterName} может попросить его напрямую.`;
      case 'es':
        return `¡Gracias! Le he dicho a ${requesterName} que aceptas. No he encontrado el contacto de ${targetName} en tu agenda — puede que ${requesterName} te lo pida directamente.`;
      default:
        return `მადლობა! ${geoName(requesterName, 'dat')} ვაცნობე შენი თანხმობა. ${geoName(targetName, 'gen')} კონტაქტი ვერ ვიპოვე შენს წიგნაკში — შესაძლოა ${geoName(requesterName, 'erg')} პირდაპირ გთხოვოს.`;
    }
  }
  switch (language) {
    case 'en':
      return `Thank you! I have given ${requesterName} ${targetName}'s contact${told(` and told ${targetName} as well`)}. They will take it from here.`;
    case 'ru':
      return `Спасибо! Я передал ${requesterName} контакт ${targetName}${told(` и предупредил ${targetName}`)}. Дальше они свяжутся сами.`;
    case 'es':
      return `¡Gracias! Le he dado a ${requesterName} el contacto de ${targetName}${told(` y también he avisado a ${targetName}`)}. A partir de aquí siguen ellos.`;
    default:
      return `მადლობა! ${geoName(requesterName, 'dat')} გადავეცი ${geoName(targetName, 'gen')} კონტაქტი${told(` და ${geoName(targetName, 'dat')}-აც ვაცნობე`)}. ისინი უკვე დაუკავშირდებიან ერთმანეთს.`;
  }
}

/** The requester's lock screen when the mediator answers. */
export function introAnsweredPush(
  language: RunLanguage,
  targetName: string,
  accepted: boolean,
): { title: string; body: string } {
  switch (language) {
    case 'en':
      return {
        title: 'Netai — introduction answered',
        body: accepted
          ? `Your introduction request to ${targetName} has an answer. Open Netai.`
          : `Your introduction request to ${targetName} was declined.`,
      };
    case 'ru':
      return {
        title: 'Netai — ответ на знакомство',
        body: accepted
          ? `На запрос знакомства с ${targetName} пришёл ответ. Открой Netai.`
          : `На запрос знакомства с ${targetName} пришёл отказ.`,
      };
    case 'es':
      return {
        title: 'Netai — respuesta a la presentación',
        body: accepted
          ? `Tu solicitud de presentación a ${targetName} tiene respuesta. Abre Netai.`
          : `Tu solicitud de presentación a ${targetName} ha sido rechazada.`,
      };
    default:
      return {
        title: 'Netai — გაცნობის პასუხი',
        body: accepted
          ? `${geoName(targetName, 'on')} გაცნობის მოთხოვნაზე პასუხი მოვიდა. გახსენი Netai.`
          : `${geoName(targetName, 'on')} გაცნობის მოთხოვნაზე უარი მიიღე.`,
      };
  }
}

/**
 * „That introduction is no longer needed" — what a MEDIATOR is told when the
 * requester stops the goal the request came out of (row 232).
 *
 * The seat's 401: goal 7262 was stopped at 14:36, and at 14:48 its request
 * 1290 was still `pending`, still in the mediator's waiting list, its thread
 * still reading „Needs your answer" — and at 14:44 the same person was asked
 * the same thing AGAIN inside a brand-new goal. An ask on a stopped goal gets
 * this note in four or five seconds and has since Ticket 6; an introduction,
 * which asks a bigger favour of the same person, got nothing.
 *
 * In the MEDIATOR's language, for the reason `askCancelledNote` records: this
 * is the message that lets a stranger off a favour, and being let off in a
 * script they cannot read is worse than not being told.
 */
export function introCancelledNote(language: RunLanguage, targetName: string): string {
  switch (language) {
    case 'en':
      return (
        `The introduction to ${targetName} is no longer needed — they have withdrawn the ` +
        'request, so there is nothing to answer. Thank you for considering it!'
      );
    case 'ru':
      return (
        `Знакомство с ${targetName} больше не нужно — запрос отозван, отвечать не нужно. ` +
        'Спасибо, что рассмотрели!'
      );
    case 'es':
      return (
        `La presentación con ${targetName} ya no hace falta: han retirado la petición, así ` +
        'que no hay nada que responder. ¡Gracias por considerarlo!'
      );
    default:
      return (
        `${targetName}-თან გაცნობა აღარ არის საჭირო — მოთხოვნა გაუქმდა, პასუხი აღარ ` +
        'არის საჭირო. მადლობა, რომ განიხილე!'
      );
  }
}

/** The mediator's thread header once the request has been withdrawn. */
export function introCancelledLine(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return 'Withdrawn';
    case 'ru':
      return 'Отозвано';
    case 'es':
      return 'Retirada';
    default:
      return 'გაუქმებულია';
  }
}
