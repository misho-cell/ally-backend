import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';

/**
 * 1692 part 1 (A9): the words of the thank-you cards. Fixed server text —
 * no model writes them, and none carries the asker's typed words (D680).
 */
export enum ThanksTap {
  Thank = 'thank',
  DoNotThank = 'do_not_thank',
  AgainYes = 'again_yes',
  AgainNo = 'again_no',
}

type ByLanguage<T> = Readonly<Record<RunLanguage, T>>;

const THANK_CARD: ByLanguage<(helper: string) => string> = {
  ka: (h) => `${geoName(h, 'dat')} მადლობა გადავუხადო შენი სახელით?`,
  en: (h) => `Shall I thank ${h} for you?`,
  ru: (h) => `Поблагодарить ${h} от твоего имени?`,
  es: (h) => `¿Le doy las gracias a ${h} de tu parte?`,
};

const THANK_CHOICES: ByLanguage<readonly [string, string]> = {
  // Not the match card's no-label (1699): one label, one card, or a tap settles the wrong one.
  ka: ['კი, მადლობა გადაუხადე', 'არა, მადლობა არ მინდა'],
  en: ['Yes, thank them', 'No need'],
  ru: ['Да, поблагодари', 'Не нужно'],
  es: ['Sí, dale las gracias', 'No hace falta'],
};

const AGAIN_CARD: ByLanguage<(helper: string) => string> = {
  ka: (h) => `ერთი რამ მხოლოდ შენთვის: ისევ მიმართავდი ${geoName(h, 'dat')}, თუ დაგჭირდება?`,
  en: (h) => `One thing just for you: would you ask ${h} again if you needed to?`,
  ru: (h) => `Один вопрос только для тебя: обратился бы ты к ${h} снова?`,
  es: (h) => `Una cosa solo para ti: ¿volverías a preguntarle a ${h}?`,
};

const AGAIN_CHOICES: ByLanguage<readonly [string, string]> = {
  ka: ['კი, ისევ მივმართავდი', 'არა, აღარ'],
  en: ['Yes, I would', 'No, I would not'],
  ru: ['Да, обратился бы', 'Нет, не обратился бы'],
  es: ['Sí, volvería', 'No, no volvería'],
};

const THANKS_TO_HELPER: ByLanguage<(asker: string) => string> = {
  ka: (a) => `${a} გიხდის მადლობას დახმარებისთვის.`,
  en: (a) => `${a} says thank you for your help.`,
  ru: (a) => `${a} благодарит тебя за помощь.`,
  es: (a) => `${a} te da las gracias por tu ayuda.`,
};

const THANKED: ByLanguage<(helper: string) => string> = {
  ka: (h) => `გადავეცი ${geoName(h, 'dat')}.`,
  en: (h) => `Passed on to ${h}.`,
  ru: (h) => `Передал ${h}.`,
  es: (h) => `Se lo he dicho a ${h}.`,
};

/** 1692 part 2: day 14, no word from the asker — the helper hears the lead is being followed, no fact. */
const FOLLOWING_UP: ByLanguage<(asker: string) => string> = {
  ka: (a) => `${a} შენს რჩევას ჯერ კიდევ მიჰყვება.`,
  en: (a) => `${a} is following up your lead.`,
  ru: (a) => `${a} ещё занимается твоей подсказкой.`,
  es: (a) => `${a} sigue tu pista.`,
};

const NOTED: ByLanguage<string> = {
  ka: 'კარგი.',
  en: 'All right.',
  ru: 'Хорошо.',
  es: 'De acuerdo.',
};

const pick = <T>(table: ByLanguage<T>, language: RunLanguage): T => table[language] ?? table.ka;

export const thankCardText = (l: RunLanguage, helper: string): string =>
  pick(THANK_CARD, l)(helper);
export const thankChoices = (l: RunLanguage): string[] => [...pick(THANK_CHOICES, l)];
export const againCardText = (l: RunLanguage, helper: string): string =>
  pick(AGAIN_CARD, l)(helper);
export const againChoices = (l: RunLanguage): string[] => [...pick(AGAIN_CHOICES, l)];
export const thanksToHelperLine = (l: RunLanguage, asker: string): string =>
  pick(THANKS_TO_HELPER, l)(asker);
export const thankedLine = (l: RunLanguage, helper: string): string => pick(THANKED, l)(helper);
export const notedLine = (l: RunLanguage): string => pick(NOTED, l);
export const followingUpLine = (l: RunLanguage, asker: string): string =>
  pick(FOLLOWING_UP, l)(asker);

/** Which thank-you button this line is; null for anything else. */
export function thanksTapOf(message: string): ThanksTap | null {
  const typed = message.trim();
  for (const [yes, no] of Object.values(THANK_CHOICES)) {
    if (typed === yes) return ThanksTap.Thank;
    if (typed === no) return ThanksTap.DoNotThank;
  }
  for (const [yes, no] of Object.values(AGAIN_CHOICES)) {
    if (typed === yes) return ThanksTap.AgainYes;
    if (typed === no) return ThanksTap.AgainNo;
  }
  return null;
}
