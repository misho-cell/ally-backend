import { RunLanguage } from './runLanguage';
import { geoName } from './georgianCase';

/**
 * The first thing a person ever reads from somebody else's assistant.
 *
 * Ticket 20, the seat's 289 and 290. Every word of the incoming-ask wrapper
 * was hardcoded Georgian, on accounts that are entirely English — and the
 * second sighting was on the INTRODUCTION, which is the single most important
 * message this product sends. A stranger's question arriving in a script the
 * reader cannot decode is not a colleague's question; it is spam.
 *
 * It was never a table of four strings to swap. The Georgian opening is built
 * from the sender's name INFLECTED INTO THE GENITIVE — „ნინიას ასისტენტი" —
 * and no other language here has anything to inflect. So each language gets
 * its own construction around a bare name, and Georgian keeps `geoName`.
 *
 * THE LANGUAGE IS THE RECIPIENT'S. Who is asking has no bearing on which
 * language the person reading it can read, and the ask thread is created empty
 * in the same breath as this text, so it has nothing in it to read — the
 * recipient's own words elsewhere are the only evidence. See `userLanguage`.
 */
export interface AskOpeningParts {
  /** First contact: „X's assistant is asking:" */
  readonly first: string;
  /** They have already replied once and the asker wrote again. */
  readonly followUp: string;
  /** The asker's side added something before any answer came. */
  readonly added: string;
  /** The line under the question that says how to answer. */
  readonly tail: string;
}

/**
 * D57 / Ticket 10 Task 23 (D121): two members of one network who have never
 * saved each other's number. Saying so is what makes a stranger's question a
 * colleague's. Absent when there is no shared roster to name.
 */
function withRoster(language: RunLanguage, name: string, roster: string | null): string {
  if (roster === null) {
    return language === 'ka' ? `${geoName(name, 'gen')} ასისტენტი` : name;
  }
  switch (language) {
    case 'en':
      return `${name} (a ${roster} member, like you)`;
    case 'ru':
      return `${name} (участник ${roster}, как и ты)`;
    case 'es':
      return `${name} (miembro de ${roster}, como tú)`;
    default:
      return `${geoName(name, 'gen')} (${roster}-ის წევრი, როგორც შენ) ასისტენტი`;
  }
}

/**
 * Three openings, because there are three situations.
 *
 * „Wrote AGAIN" is a true sentence only about somebody who has already
 * replied. Said to a person who has not, forty-one seconds after the first
 * message, above the identical question, it reads as being chased by a
 * machine — the seat found exactly that on two consecutive days. The third
 * case is neither a chase nor a first contact: the asker's side had more to
 * say before an answer came, and „added" does not accuse the reader of
 * ignoring anything.
 */
export function askOpeningParts(
  language: RunLanguage,
  senderName: string,
  roster: string | null,
): AskOpeningParts {
  const who = withRoster(language, senderName, roster);
  switch (language) {
    case 'en':
      return {
        first: `${who}'s assistant is asking:`,
        followUp: `${senderName}'s assistant has written again:`,
        added: `${senderName}'s assistant added:`,
        tail: 'Just reply in this thread and I will pass your answer on.',
      };
    case 'ru':
      return {
        first: `Ассистент ${who} спрашивает:`,
        followUp: `Ассистент ${senderName} написал ещё раз:`,
        added: `Ассистент ${senderName} добавил:`,
        tail: 'Просто ответь в этой ветке — я передам твой ответ.',
      };
    case 'es':
      return {
        first: `El asistente de ${who} pregunta:`,
        followUp: `El asistente de ${senderName} ha escrito otra vez:`,
        added: `El asistente de ${senderName} ha añadido:`,
        tail: 'Responde en este hilo y le paso tu respuesta.',
      };
    default:
      return {
        first: `${who} გეკითხება:`,
        followUp: `${geoName(senderName, 'gen')} ასისტენტმა კიდევ დაწერა:`,
        added: `${geoName(senderName, 'gen')} ასისტენტმა დაამატა:`,
        tail: 'უბრალოდ მიპასუხე ამ თრედში — პასუხს მე გადავცემ.',
      };
  }
}

/** The whole opening message: who is asking, their words, and how to answer. */
export function buildAskOpening(
  language: RunLanguage,
  senderName: string,
  roster: string | null,
  question: string,
  shape: 'first' | 'followUp' | 'added',
): string {
  const parts = askOpeningParts(language, senderName, roster);
  // Plain text, no markdown: the recipient-side renderer shows the asterisks
  // verbatim (ticket 3 §6.3).
  return `${parts[shape]}\n\n"${question}"\n\n${parts.tail}`;
}

/** The name a sender with no stored name is given, in the reader's language. */
export function unknownSenderName(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return 'A Netai member';
    case 'ru':
      return 'Участник Netai';
    case 'es':
      return 'Un miembro de Netai';
    default:
      return 'Netai-ს მომხმარებელი';
  }
}

/**
 * „That question is no longer needed" — what a recipient is told when the
 * owner stops the goal their question came from.
 *
 * The seat's fourth locale sighting of the evening, and the second that is the
 * server's rather than the client's: Test 3's interface is English end to end
 * and this note arrived in Georgian. It is also the message that closes a
 * stranger's loop — somebody was asked for a favour and is being let off, and
 * being let off in an unreadable script is worse than not being told.
 */
export function askCancelledNote(language: RunLanguage): string {
  switch (language) {
    case 'en':
      return 'This question is no longer needed — no reply necessary. Thank you!';
    case 'ru':
      return 'Этот вопрос больше не актуален — отвечать не нужно. Спасибо!';
    case 'es':
      return 'Esta pregunta ya no hace falta: no necesitas responder. ¡Gracias!';
    default:
      return 'ეს კითხვა აღარ არის აქტუალური — პასუხი აღარ არის საჭირო. მადლობა!';
  }
}

/**
 * „Your rule answered this for you."
 *
 * Reaches the RECIPIENT in their own ask thread — the same stranger the
 * wrapper above speaks to, and this was Georgian for all of them until today.
 */
export function answeredByYourRule(
  language: RunLanguage,
  ruleKind: string,
  answer: string,
): string {
  const quoted = `\n\n"${answer}"\n\n`;
  switch (language) {
    case 'en':
      return (
        `Your rule („${ruleKind}") answered this automatically:${quoted}` +
        'If you no longer want that rule, tell me and I will drop it — next time I will ask you.'
      );
    case 'ru':
      return (
        `Твоё правило („${ruleKind}") ответило автоматически:${quoted}` +
        'Если это правило больше не нужно, скажи — я его сниму, и в следующий раз спрошу тебя.'
      );
    case 'es':
      return (
        `Tu regla („${ruleKind}") respondió automáticamente:${quoted}` +
        'Si ya no la quieres, dímelo y la quito — la próxima vez te preguntaré a ti.'
      );
    default:
      return (
        `შენი წესით („${ruleKind}") ავტომატურად ვუპასუხე:${quoted}` +
        'თუ ეს წესი აღარ გინდა, მითხარი და გავაუქმებ — შემდეგ ჯერზე ისევ შენ გკითხავ.'
      );
  }
}

/**
 * The thank-you to the BRIDGE once the person they passed the question to has
 * answered. Georgian needs the ergative, because „გიპასუხა" is an aorist and
 * „ერეკლე გიპასუხა" is ungrammatical; no other language here inflects.
 */
export function bridgeThanks(language: RunLanguage, namedName: string | null): string {
  const name = namedName?.trim() ?? '';
  switch (language) {
    case 'en':
      return (
        `${name || 'They'} answered, and the answer has gone to the person who asked. ` +
        'Thank you for making the connection.'
      );
    case 'ru':
      return (
        `${name || 'Человек'} ответил, и ответ передан тому, кто спрашивал. ` +
        'Спасибо, что связал.'
      );
    case 'es':
      return (
        `${name || 'La persona'} ha respondido y la respuesta ha llegado a quien preguntaba. ` +
        'Gracias por hacer la conexión.'
      );
    default:
      return (
        `${name ? geoName(name, 'erg') : 'ადამიანმა'} გიპასუხა და პასუხი კითხვის ავტორს ` +
        'გადაეცა. დიდი მადლობა, რომ დააკავშირე.'
      );
  }
}

/**
 * ROW 274 — THE BUTTON THAT MAKES A NO A RECORDED FACT.
 *
 * The founder's two options were: (A) a real decline button, or (B) let the
 * model decide from the words whether an answer was a refusal. Misho chose A
 * on 26 September, and A is the safer one for a reason worth writing down:
 * under B, „not right now, maybe next week" can be filed as a permanent no,
 * and that decision gets made ON SOMEBODY'S BEHALF. Under A a refusal exists
 * only when the person said so themselves.
 *
 * ⚠️ AND THE TEXT BEING OURS IS THE WHOLE MECHANISM. The button sends this
 * exact sentence as the person's answer, so the server recognises a decline by
 * COMPARING STRINGS — not by judging words. That comparison is the difference
 * between option A and option B; the moment it becomes a guess, it is B.
 *
 * So every language's sentence is listed here and matched exactly. A reader
 * who types something that merely means no is NOT a decline by this rule: they
 * answered, and their words go to the asker as words. That is the honest
 * outcome, and it is the one that makes the count mean something.
 */
const DECLINE_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: "I can't help with this one",
  ru: 'С этим помочь не смогу',
  es: 'Con esto no puedo ayudar',
  ka: 'ამაში ვერ დაგეხმარები',
};

/** The tappable refusal offered under an incoming ask, in the reader's language. */
export function declineChoice(language: RunLanguage): string {
  return DECLINE_CHOICE[language] ?? DECLINE_CHOICE.ka;
}

/**
 * Is this answer the button, in ANY language?
 *
 * ⚠️ ALL OF THEM, not just the thread's own. A person's language is decided
 * from the evidence available at the time, and it can be decided differently
 * on the day the ask arrives and the day they answer — `userLanguage` reads
 * their words, and there are more of them later. Matching only the language we
 * think they have would drop a refusal for the one reader whose language we
 * revised, which is the reader we were least sure about to begin with.
 */
export function isDeclineChoice(answer: string): boolean {
  const said = (answer ?? '').trim();
  if (said === '') return false;
  return Object.values(DECLINE_CHOICE).some((choice) => choice === said);
}
