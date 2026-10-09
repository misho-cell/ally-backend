import { AskKind, askKindOf } from './askKind';
import { labelFits } from './oneLanguageAsk';
import { georgianToLatin, hasGeorgian } from './tools/transliterate';
import { nameToSay } from './spokenName';
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
/**
 * 2773: in an English (or Russian, Spanish) frame the asker's Georgian name was
 * printed in Georgian letters — „ანა საცდელაძე's assistant is asking". Outside
 * Georgian the name is written in Latin letters, each word capitalised.
 */
function nameForFrame(language: RunLanguage, senderName: string): string {
  if (language === 'ka' || !hasGeorgian(senderName)) return senderName;
  return georgianToLatin(senderName)
    .split(/(\s+)/u)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function askOpeningParts(
  language: RunLanguage,
  givenName: string,
  roster: string | null,
): AskOpeningParts {
  const senderName = nameForFrame(language, givenName);
  const who = withRoster(language, senderName, roster);
  switch (language) {
    case 'en':
      return {
        first: `${who}'s assistant is asking:`,
        followUp: `${senderName}'s assistant has written again:`,
        added: `${senderName}'s assistant added:`,
      };
    case 'ru':
      return {
        first: `Ассистент ${who} спрашивает:`,
        followUp: `Ассистент ${senderName} написал ещё раз:`,
        added: `Ассистент ${senderName} добавил:`,
      };
    case 'es':
      return {
        first: `El asistente de ${who} pregunta:`,
        followUp: `El asistente de ${senderName} ha escrito otra vez:`,
        added: `El asistente de ${senderName} ha añadido:`,
      };
    default:
      return {
        first: `${who} გეკითხება:`,
        followUp: `${geoName(senderName, 'gen')} ასისტენტმა კიდევ დაწერა:`,
        added: `${geoName(senderName, 'gen')} ასისტენტმა დაამატა:`,
      };
  }
}

/**
 * Tester 40229 (#1618): the helper read „<asker>'s assistant is asking: Hi,
 * <asker> is asking: …" — the model opened the question with the frame's own
 * words. A greeting, and a lead-in that names who is asking, are the frame's
 * job; at the start of the question they go.
 */
const GREETING_RE = /^\s*(?:hi|hello|hey|გამარჯობა|სალამი|привет|здравствуйте|hola)[\s,!.:]*/iu;
const ASKING_LEAD_RE =
  /^[^:\n]{0,60}(?:is asking|asks|გეკითხება|გთხოვს|спрашивает|pregunta)\s*:\s*/iu;

/** Tester 40395 (a): the lead-in moved to the tail — „…a car? Levan is asking." */
const ASKING_TAIL_RE =
  /[\s.]*(?:^|(?<=[.!?…]))\s*[^.!?…\n]{0,40}(?:is asking|asks|გეკითხება|გთხოვს|спрашивает|pregunta)[.!]?\s*$/iu;

function withoutAskingTail(question: string): string {
  const trimmed = question.replace(ASKING_TAIL_RE, '').trim();
  return trimmed === '' ? question : trimmed;
}

export function withoutFramesOwnWords(question: string): string {
  const afterGreeting = question.replace(GREETING_RE, '');
  // Only the doubled frame goes; a plain greeting to the helper stays as written.
  if (!ASKING_LEAD_RE.test(afterGreeting)) return withoutAskingTail(question);
  const trimmed = afterGreeting.replace(ASKING_LEAD_RE, '').trim();
  return trimmed === '' ? question : trimmed;
}

/**
 * The whole opening message: who is asking, and the question.
 *
 * D707 (the founder, 7 Oct, his own account): the line under the question —
 * „უბრალოდ მიპასუხე ამ თრედში — პასუხს მე გადავცემ." — is gone in every
 * language. Nobody reading a question needs to be told to answer it, and
 * „thread" is not a word a person reads.
 */
export function buildAskOpening(
  language: RunLanguage,
  senderName: string,
  roster: string | null,
  question: string,
  shape: 'first' | 'followUp' | 'added',
): string {
  const parts = askOpeningParts(language, senderName, roster);
  // Plain text, no markdown: the recipient-side renderer shows the asterisks
  // verbatim (ticket 3 §6.3). D648: no quotation marks either — the question is
  // the asker's assistant's wording, not anybody's quoted words.
  return `${parts[shape]}\n\n${withoutFramesOwnWords(question)}`;
}

/**
 * 1687 (A4, the intelligence research of 6 October, D679/D680): trust falls
 * when it is unclear which messages a machine wrote. Every outgoing ask ends
 * with the identical line, the asker's name as the profile shows it, never the
 * model's choice of words: „ნინო ბერიძის ასისტენტი, ნინო ბერიძის სახელით".
 *
 * No leading dash: every stored assistant text goes through the mechanical
 * scrub, which reads „\n\n— " as a dash in prose and turns it into „, " — the
 * first version arrived glued to the question (D710 revert, 9 Oct 02:11Z).
 * The line stands as its own paragraph instead.
 */
export function disclosureLine(language: RunLanguage, profileName: string): string {
  const name = profileName.trim();
  switch (language) {
    case 'en':
      return `${name}'s assistant, for ${name}`;
    case 'ru':
      return `Ассистент ${name}, от имени ${name}`;
    case 'es':
      return `Asistente de ${name}, en nombre de ${name}`;
    default: {
      const of = geoName(name, 'gen');
      return `${of} ასისტენტი, ${of} სახელით`;
    }
  }
}

/** Above this many characters an ask gets about a fifth fewer replies (A4). */
export const ASK_BODY_MAX_CHARS = 400;

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

/** Every language's decline buttons, for the prompt that must recognise a tap of one. */
export function allDeclineChoices(): readonly string[] {
  return [...Object.values(DECLINE_CHOICE), ...Object.values(KNOW_NO_CHOICE)];
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
  return (
    matchesAnyLanguage(DECLINE_CHOICE, answer) ||
    matchesAnyLanguage(KNOW_NO_CHOICE, answer) ||
    matchesAnyLanguage(INTRO_NO_CHOICE, answer)
  );
}

/**
 * ROW 300 — TWO MORE BUTTONS: „YES, I CAN HELP" AND „LATER".
 *
 * Row 274 said one button was enough because saying yes is answering. The
 * tester showed the gap that left: a reader who CAN help but needs a day to
 * find the number had no way to say so, and the asker sat looking at silence
 * that meant yes. Both new taps are exact strings for the same reason the
 * decline is — the server acts on what the person pressed, never on a guess
 * about what their words meant.
 *
 * There is no „other" button: the text field is always there.
 */
const YES_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: 'Yes, I can help',
  ru: 'Да, помогу',
  es: 'Sí, puedo ayudar',
  ka: 'კი, დაგეხმარები',
};

const LATER_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: "I'll answer later",
  ru: 'Отвечу позже',
  es: 'Responderé más tarde',
  ka: 'მოგვიანებით გიპასუხებ',
};

/**
 * #1948: the buttons for a „do you know someone" question. „Yes, I know
 * someone" is the same tap as „yes, I can help" (the asker hears it at once);
 * „No, I don't" is a decline, never a dead end for the asker's goal.
 */
const KNOW_YES_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: 'Yes, I know someone',
  ru: 'Да, знаю',
  es: 'Sí, conozco a alguien',
  ka: 'კი, ვიცნობ',
};

const KNOW_NO_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: "No, I don't know anyone",
  ru: 'Нет, не знаю',
  es: 'No, no conozco a nadie',
  ka: 'არა, არ ვიცნობ',
};

/**
 * #2185: the buttons for „will you introduce me". The yes is the same tap as
 * „yes, I can help"; the no is a decline.
 */
const INTRO_YES_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: "Yes, I'll introduce you",
  ru: 'Да, познакомлю',
  es: 'Sí, te lo presento',
  ka: 'კი, გაგაცნობ',
};

const INTRO_NO_CHOICE: Readonly<Record<RunLanguage, string>> = {
  en: "I can't introduce you",
  ru: 'Не смогу познакомить',
  es: 'No puedo presentártelo',
  ka: 'ვერ გაგაცნობ',
};

/** #1948: a plain yes / no — sent as the answer itself, like typed words. */
const PLAIN_YES: Readonly<Record<RunLanguage, string>> = {
  en: 'Yes',
  ru: 'Да',
  es: 'Sí',
  ka: 'კი',
};
const PLAIN_NO: Readonly<Record<RunLanguage, string>> = {
  en: 'No',
  ru: 'Нет',
  es: 'No',
  ka: 'არა',
};

/** What a tap of one of our buttons means; `null` for anything the person typed. */
export enum AskTap {
  Yes = 'yes',
  Decline = 'decline',
  Later = 'later',
}

/** The three buttons under an incoming ask, in the order they are drawn. */
export function askChoices(language: RunLanguage): readonly string[] {
  return [YES_CHOICE, DECLINE_CHOICE, LATER_CHOICE].map((labels) => labels[language] ?? labels.ka);
}

/**
 * #1948: the buttons under THIS question, by what kind of question it is.
 * Every kind keeps „later"; only a request for help keeps „yes, I can help".
 */
export function askChoicesFor(question: string, language: RunLanguage): readonly string[] {
  const pick = (labels: Readonly<Record<RunLanguage, string>>): string =>
    labels[language] ?? labels.ka;
  switch (askKindOf(question)) {
    case AskKind.Intro:
      return [INTRO_YES_CHOICE, INTRO_NO_CHOICE, LATER_CHOICE].map(pick);
    case AskKind.Know:
      return [KNOW_YES_CHOICE, KNOW_NO_CHOICE, LATER_CHOICE].map(pick);
    case AskKind.YesNo:
      return [PLAIN_YES, PLAIN_NO, LATER_CHOICE].map(pick);
    case AskKind.Open:
      return [pick(LATER_CHOICE)];
    default:
      return askChoices(language);
  }
}

/** Every language's „yes" buttons, for the prompt that must recognise a tap of one. */
export function allYesChoices(): readonly string[] {
  return [
    ...Object.values(YES_CHOICE),
    ...Object.values(KNOW_YES_CHOICE),
    ...Object.values(INTRO_YES_CHOICE),
  ];
}

/** The tappable „later" offered under an incoming ask, in the reader's language. */
export function laterChoice(language: RunLanguage): string {
  return LATER_CHOICE[language] ?? LATER_CHOICE.ka;
}

/** Every language's „later" button, for the prompt that must recognise a tap of it. */
export function allLaterChoices(): readonly string[] {
  return Object.values(LATER_CHOICE);
}

/** Which of our buttons this message is, in ANY language (see `isDeclineChoice`). */
export function askTapOf(message: string): AskTap | null {
  if (
    matchesAnyLanguage(YES_CHOICE, message) ||
    matchesAnyLanguage(KNOW_YES_CHOICE, message) ||
    matchesAnyLanguage(INTRO_YES_CHOICE, message)
  )
    return AskTap.Yes;
  if (isDeclineChoice(message)) return AskTap.Decline;
  if (matchesAnyLanguage(LATER_CHOICE, message)) return AskTap.Later;
  return null;
}

/** How a tapped label is quoted to the asker, per language. */
const QUOTED_TAP: Readonly<Record<RunLanguage, (name: string, label: string) => string>> = {
  ka: (name, label) => `${name}: „${label}"`,
  en: (name, label) => `${name}: "${label}"`,
  ru: (name, label) => `${name}: «${label}»`,
  es: (name, label) => `${name}: «${label}»`,
};

/**
 * The one line the ASKER gets the moment the reader taps „yes" or „later",
 * in the asker's language. The answer itself still arrives the ordinary way;
 * this only replaces silence with what the reader actually said.
 *
 * T2476 (the MASTER TEST RUN's QA-003): „are you free tomorrow evening?" →
 * „კი, თავისუფალი ვარ" reached the asker as „says he will help, details soon".
 * A „yes" is told as the label the reader tapped, word for word, when it reads
 * in the asker's language; the general sentence only when it does not.
 */
export function askTapLineForAsker(
  tap: AskTap.Yes | AskTap.Later,
  language: RunLanguage,
  readerName: string,
  tappedLabel?: string,
): string {
  const name = nameToSay(readerName, language);
  const label = tappedLabel?.trim() ?? '';
  if (tap === AskTap.Yes && label !== '' && labelFits(label, language)) {
    return (QUOTED_TAP[language] ?? QUOTED_TAP.ka)(name, label);
  }
  const lines: Readonly<Record<RunLanguage, string>> =
    tap === AskTap.Yes
      ? {
          en: `${name} says they can help — the details are on their way.`,
          ru: `${name} говорит, что может помочь — подробности скоро будут.`,
          es: `${name} dice que puede ayudar — los detalles llegarán pronto.`,
          ka: `${name} ამბობს, რომ დაგეხმარება — დეტალებს მალე მოგწერს.`,
        }
      : {
          en: `${name} will answer later.`,
          ru: `${name} ответит позже.`,
          es: `${name} responderá más tarde.`,
          ka: `${name} მოგვიანებით გიპასუხებს.`,
        };
  return lines[language] ?? lines.ka;
}

function matchesAnyLanguage(
  labels: Readonly<Record<RunLanguage, string>>,
  answer: string,
): boolean {
  const said = (answer ?? '').trim();
  if (said === '') return false;
  return Object.values(labels).some((choice) => choice === said);
}
