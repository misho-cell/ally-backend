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

const TO_THE_NEED: ByLanguage<(name: string) => string> = {
  ka: (n) => `${n} სიამოვნებით დაგელაპარაკება. მითხარი, რა გადავცე, და მე მივუტან.`,
  en: (n) => `${n} is happy to talk. Tell me what to pass on and I will carry it.`,
  ru: (n) => `${n} с радостью поговорит. Скажи, что передать, и я передам.`,
  es: (n) => `${n} está encantado de hablar. Dime qué le paso y se lo llevo.`,
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

const ASKED: ByLanguage<string> = {
  ka: 'კარგი, ვკითხავ და გეტყვი.',
  en: 'Good, I will ask and let you know.',
  ru: 'Хорошо, спрошу и скажу.',
  es: 'Bien, le pregunto y te digo.',
};

const NOTED: ByLanguage<string> = {
  ka: 'კარგი.',
  en: 'All right.',
  ru: 'Хорошо.',
  es: 'De acuerdo.',
};

const pick = <T>(table: ByLanguage<T>, language: RunLanguage): T => table[language] ?? table.ka;

export const card1Text = (language: RunLanguage, field: string): string =>
  pick(CARD1, language)(field);
export const card2Text = (language: RunLanguage, field: string): string =>
  pick(CARD2, language)(field);
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
