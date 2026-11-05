import { RunLanguage } from './runLanguage';
import { ClaimKind, makesClaim, OwnerAsk, ReplyClaims } from './replyClaims.service';

/**
 * 3302 (MASTER TEST RUN ME-016 / PR-036, 2 sightings): in a NEW conversation
 * „დაივიწყე, რომ <name> ელექტრიკოსია" was answered „…ჩანაწერი წავშალე" or
 * „…წასაშლელად მოვნიშნე" with no tool called at all, and the fact was told
 * back the next day. A reply may say something was deleted only when a tool
 * that deletes ran in that run. Otherwise the owner reads the truth, with a
 * button to confirm, and the next run deletes it the ordinary way.
 */
export const DELETING_TOOLS: ReadonlySet<string> = new Set([
  'forget_contact_fact',
  'retract_contact_fact',
  'correct_contact_fact',
  'forget_user_note',
  'forget_fact_about_me',
  // #4126 (the tester's 69003, threads 60916-18): „delete that I work at X"
  // lives in the owner's profile, and the run removed it by rewriting the
  // field without X. The guard fires only on a line asking to delete, so an
  // overwrite in that run IS the deletion — and the honest „deleted" was being
  // replaced with „not deleted yet, confirm", twice, in a loop.
  'update_user_profile',
  'forget_contact_relationship',
  'delete_answer_rule',
  'remove_contact_from_network',
  'remove_contact_exclusion',
]);

// Every word is matched WHOLE (3565): the earlier list matched inside other
// words — „quit[ée]" inside "quite", „elimin[ée]" inside "eliminate" — and
// ordinary answers got the delete card. Spanish takes only the accented past
// („borré"), never the unaccented form that is also „that I delete". `\b` knows only Latin letters, so the
// edges are written as „no letter before / after" for every alphabet.
/**
 * 3565 (F17): a plain question („ვინ შემინახა?") got „not deleted yet — confirm"
 * with a delete button. The guard fires only when the owner asked to delete,
 * forget or remove something. #8779 c: that, and the reply's „deleted", are the
 * small model's reading (replyClaims.service); the tools are the server's check.
 */
export function deletionClaimWithoutTool(
  claims: ReplyClaims,
  toolNamesUsed: readonly string[],
): boolean {
  return (
    claims.ownerAsks.has(OwnerAsk.Delete) &&
    makesClaim(claims, ClaimKind.Deleted) &&
    !toolNamesUsed.some((name) => DELETING_TOOLS.has(name))
  );
}

export interface NotDeletedLine {
  readonly text: string;
  readonly confirm: string;
}

const NOT_DELETED: Readonly<Record<RunLanguage, NotDeletedLine>> = {
  ka: {
    text: 'ეს ჯერ არ წამიშლია. დამიდასტურე და ახლავე წავშლი.',
    confirm: 'კი, წაშალე',
  },
  en: {
    text: 'I have not deleted it yet. Confirm and I will delete it now.',
    confirm: 'Yes, delete it',
  },
  ru: { text: 'Я ещё не удалил это. Подтверди, и я удалю сейчас.', confirm: 'Да, удали' },
  es: { text: 'Todavía no lo he borrado. Confírmalo y lo borro ahora.', confirm: 'Sí, bórralo' },
};

export function notDeletedLine(language: RunLanguage): NotDeletedLine {
  return NOT_DELETED[language] ?? NOT_DELETED.ka;
}
