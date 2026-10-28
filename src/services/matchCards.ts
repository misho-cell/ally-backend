import { fieldInScript } from './fieldPlaces';
import { RunLanguage } from './runLanguage';

/**
 * 1699 part 2 (A16): the words of the two no-name cards and of what follows
 * them. Card 1 names the field only; card 2 names the field only, never the
 * goal's text; names are said to each other only after both yes (D680).
 */
export enum MatchTap {
  Yes = 'yes',
  No = 'no',
}

type ByLanguage<T> = Readonly<Record<RunLanguage, T>>;

const CARD1: ByLanguage<(field: string) => string> = {
  ka: (f) =>
    `შენს წრეში ვიღაც სწორედ ამისთვის არის ღია — ${f}. ვკითხო, ხომ არ სურს შენთან დალაპარაკება?`,
  en: (f) =>
    `Someone in your circle is open to exactly this — ${f}. Shall I ask whether they want to talk?`,
  ru: (f) => `Кто-то в твоём круге открыт именно к этому — ${f}. Спросить, хочет ли он поговорить?`,
  es: (f) =>
    `Alguien de tu círculo está abierto justo a esto: ${f}. ¿Le pregunto si quiere hablar?`,
};

const CARD2: ByLanguage<(field: string) => string> = {
  ka: (f) => `შენს წრეში ვიღაცას სჭირდება რაღაც შენს სფეროში — ${f}. დაგაკავშიროთ?`,
  en: (f) =>
    `Someone in your circle needs something in your field — ${f}. Shall I put you in touch?`,
  ru: (f) => `Кому-то в твоём круге нужно что-то в твоей сфере — ${f}. Связать вас?`,
  es: (f) => `Alguien de tu círculo necesita algo de tu ámbito: ${f}. ¿Os pongo en contacto?`,
};

const CARD1_CHOICES: ByLanguage<readonly [string, string]> = {
  ka: ['კი, ჰკითხე', 'არა, საჭირო არაა'],
  en: ['Yes, ask them', 'No, thanks'],
  ru: ['Да, спроси', 'Нет, не надо'],
  es: ['Sí, pregúntale', 'No, gracias'],
};

const CARD2_CHOICES: ByLanguage<readonly [string, string]> = {
  ka: ['კი, დამაკავშირე', 'არა, ახლა არა'],
  en: ['Yes, connect us', 'Not now'],
  ru: ['Да, свяжи', 'Сейчас нет'],
  es: ['Sí, conéctanos', 'Ahora no'],
};

// #7823 (Misho's yes, 26 Oct): after both yeses the need side is offered a meeting.
const TO_THE_NEED: ByLanguage<(name: string) => string> = {
  ka: (n) =>
    `${n} სიამოვნებით დაგელაპარაკება. შეხვედრა დაგინიშნოთ? მითხარი, როდის გცალია — ან რა გადავცე და მე მივუტან.`,
  en: (n) =>
    `${n} is happy to talk. Shall I set up a meeting? Tell me when you are free — or what to pass on, and I will carry it.`,
  ru: (n) =>
    `${n} с радостью поговорит. Назначить встречу? Скажи, когда тебе удобно — или что передать, и я передам.`,
  es: (n) =>
    `${n} está encantado de hablar. ¿Organizo una reunión? Dime cuándo te viene bien — o qué le paso, y se lo llevo.`,
};

const TO_THE_OFFER: ByLanguage<(name: string) => string> = {
  ka: (n) => `დაგაკავშირე: ${n}. ის ჩემი მეშვეობით მოგწერს.`,
  en: (n) => `You are connected with ${n}. They will write to you through me.`,
  ru: (n) => `Я связал вас: ${n}. Он напишет тебе через меня.`,
  es: (n) => `Os he puesto en contacto: ${n}. Te escribirá a través de mí.`,
};

const NOTHING_CAME: ByLanguage<string> = {
  ka: 'ამჯერად არაფერი გამოვიდა.',
  en: 'Nothing came of it this time.',
  ru: 'В этот раз ничего не вышло.',
  es: 'Esta vez no salió nada.',
};

/** #5149 (the founder's yes, box 66994): the question goes to the other person's assistant. */
const ASKED: ByLanguage<string> = {
  ka: 'კარგი, მის ასისტენტს ვკითხავ და გეტყვი.',
  en: 'Good, I will ask their assistant and let you know.',
  ru: 'Хорошо, спрошу его ассистента и скажу.',
  es: 'Bien, le pregunto a su asistente y te digo.',
};

const NOTED: ByLanguage<string> = {
  ka: 'კარგი.',
  en: 'All right.',
  ru: 'Хорошо.',
  es: 'De acuerdo.',
};

const pick = <T>(table: ByLanguage<T>, language: RunLanguage): T => table[language] ?? table.ka;

/** The field in the reader's script where the trade list knows the word (1699, box 50656). */
const fieldFor = (language: RunLanguage, field: string): string =>
  fieldInScript(field, language === 'ka');

export const card1Text = (language: RunLanguage, field: string): string =>
  pick(CARD1, language)(fieldFor(language, field));
export const card2Text = (language: RunLanguage, field: string): string =>
  pick(CARD2, language)(fieldFor(language, field));
export const card1Choices = (language: RunLanguage): string[] => [...pick(CARD1_CHOICES, language)];
export const card2Choices = (language: RunLanguage): string[] => [...pick(CARD2_CHOICES, language)];
export const toTheNeedLine = (language: RunLanguage, name: string): string =>
  pick(TO_THE_NEED, language)(name);
export const toTheOfferLine = (language: RunLanguage, name: string): string =>
  pick(TO_THE_OFFER, language)(name);
export const askedLine = (language: RunLanguage): string => pick(ASKED, language);
export const notedLine = (language: RunLanguage): string => pick(NOTED, language);
export const nothingCameLine = (language: RunLanguage): string => pick(NOTHING_CAME, language);

/** Which card button this line is, and on which card; null for anything else. */
export function matchTapOf(
  message: string,
): { readonly card: 1 | 2; readonly tap: MatchTap } | null {
  const typed = message.trim();
  for (const [card, table] of [
    [1, CARD1_CHOICES],
    [2, CARD2_CHOICES],
  ] as const) {
    for (const [yes, no] of Object.values(table)) {
      if (typed === yes) return { card, tap: MatchTap.Yes };
      if (typed === no) return { card, tap: MatchTap.No };
    }
  }
  return null;
}

/**
 * #7823 part 2 (tester 77396, 4 of 6): the cards' buttons are gone (#8054, no
 * buttons anywhere), so people answer a card by typing „კი" — and only the
 * exact button label was read. A short typed yes or no now answers the card
 * that waits in this conversation; anything longer goes to the model as before.
 */
const TYPED_YES_RE =
  /^\s*(?:კი|დიახ|ხო|ჰო|კარგი|yes|yeah|sure|ok|okay|да|конечно|sí|si|claro)(?:[\s,.!]+[\p{L}\p{M}]+){0,2}[\s.!]*$/iu;
const TYPED_NO_RE =
  /^\s*(?:არა|არ\s+მინდა|no|nope|нет|не\s+надо)(?:[\s,.!]+[\p{L}\p{M}]+){0,2}[\s.!]*$/iu;

export function typedMatchAnswer(message: string): MatchTap | null {
  if (TYPED_NO_RE.test(message)) return MatchTap.No;
  if (TYPED_YES_RE.test(message)) return MatchTap.Yes;
  return null;
}
