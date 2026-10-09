import { RunLanguage } from './runLanguage';
import { NotDeletedLine } from './deletionClaim';

/**
 * 3796 (box 48569, 1 of 3 since 86e7e26): „ჩემი შეთავაზება … დაიმახსოვრე
 * როგორც შეთავაზება" was answered „დავიმახსოვრე შენი შეთავაზება…" with no
 * tool called, and the offers list stayed empty. Like 3302's „deleted": a reply
 * may say an offer was saved only when save_offer ran in that run. Otherwise
 * the owner reads the truth, with a button to confirm, and the next run saves
 * it the ordinary way. Both halves read the offer word, so a saved profile
 * line („დავიმახსოვრე, რომ ბუღალტერი ხარ") is never touched.
 */
/**
 * The verb's root, not only the noun's: box 48874's reply was „დავიმახსოვრე:
 * შენ სხვა წევრებს სთავაზობ…" — „სთავაზობ" carries no „შეთავაზ" and the guard
 * let it through. „თავაზიანი" (polite) shares the root and is left out.
 */
const OFFER_WORD_RE = /(თავაზ(?!იან)|\boffer|предлож|предлага|\boferta|\bofrec)/iu;

const SAVED_WORDS: readonly string[] = [
  'დავიმახსოვრე',
  'შევინახე',
  'შენახულია',
  'ჩავიწერე',
  'saved',
  'noted',
  'remembered',
  'сохранил[аи]?',
  'запомнил[аи]?',
  'guardé',
  'guardad[oa]',
];

const CLAIMS_SAVED_RE = new RegExp(
  `(?<![\\p{L}\\p{M}])(?:${SAVED_WORDS.join('|')})(?![\\p{L}\\p{M}])`,
  'iu',
);

/**
 * Box 48975 (fresh seat, onboarding run): „…დაიმახსოვრე როგორც შეთავაზება."
 * was answered „დავიმახსოვრე: იურიდიული კონსულტაცია…" — the reply named the
 * service, not an offer, so a guard that waited for the offer word in the
 * reply never fired. When the owner's own line names an offer AND asks for it
 * to be kept, any „saved" without save_offer is the false claim.
 */
const ASKS_TO_SAVE_RE =
  /(დაიმახსოვრე|შეინახე|ჩაიწერე|დაამატე|\bsave\b|\bremember\b|\bkeep\b|\badd\b|запомни|сохрани|добавь|guarda|recuerda|añade)/iu;

const SAVE_OFFER_TOOL_NAME = 'save_offer';

function replySpeaksOfTheOffer(reply: string, ownerLine: string): boolean {
  return OFFER_WORD_RE.test(reply) || ASKS_TO_SAVE_RE.test(ownerLine);
}

export function offerClaimWithoutTool(
  reply: string,
  toolNamesUsed: readonly string[],
  ownerLine: string,
): boolean {
  return (
    OFFER_WORD_RE.test(ownerLine) &&
    replySpeaksOfTheOffer(reply, ownerLine) &&
    CLAIMS_SAVED_RE.test(reply) &&
    !toolNamesUsed.includes(SAVE_OFFER_TOOL_NAME)
  );
}

const NOT_SAVED: Readonly<Record<RunLanguage, NotDeletedLine>> = {
  ka: {
    text: 'შეთავაზება ჯერ არ შემინახავს. დამიდასტურე და ახლავე შევინახავ.',
    confirm: 'კი, შეინახე',
  },
  en: {
    text: 'I have not saved your offer yet. Confirm and I will save it now.',
    confirm: 'Yes, save it',
  },
  ru: {
    text: 'Я ещё не сохранил это предложение. Подтверди, и я сохраню сейчас.',
    confirm: 'Да, сохрани',
  },
  es: {
    text: 'Todavía no he guardado tu oferta. Confírmalo y la guardo ahora.',
    confirm: 'Sí, guárdala',
  },
};

export function offerNotSavedLine(language: RunLanguage): NotDeletedLine {
  return NOT_SAVED[language] ?? NOT_SAVED.ka;
}
