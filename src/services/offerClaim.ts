import { RunLanguage } from './runLanguage';
import { NotDeletedLine } from './deletionClaim';
import { ClaimKind, makesClaim, OwnerAsk, ReplyClaims } from './replyClaims.service';

/**
 * 3796 (box 48569): „ჩემი შეთავაზება … დაიმახსოვრე როგორც შეთავაზება" was
 * answered „დავიმახსოვრე შენი შეთავაზება…" with no tool called, and the offers
 * list stayed empty. A reply may say an offer was saved only when save_offer ran
 * in that run; otherwise the owner reads the truth, with a button to confirm.
 * #8218: only when the owner offers something of their own — a helper's „offer
 * them to him" is not. #8779 c: both readings are the small model's
 * (replyClaims.service); whether save_offer ran is the server's check.
 */
const SAVE_OFFER_TOOL_NAME = 'save_offer';

export function offerClaimWithoutTool(
  claims: ReplyClaims,
  toolNamesUsed: readonly string[],
): boolean {
  return (
    claims.ownerAsks.has(OwnerAsk.OffersOwnService) &&
    makesClaim(claims, ClaimKind.OfferSaved) &&
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
