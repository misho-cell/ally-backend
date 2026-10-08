import { RunLanguage } from './runLanguage';

/**
 * 3565 (F17, 2 sightings): „Who do I have as a lawyer?" and „ვინ შემინახა და
 * როგორ?" got „I have not deleted it yet. Confirm and I will delete it now."
 * with a delete button — a plain question, and a tap could have deleted
 * something nobody asked to delete. The guard reads the owner's own line too:
 * it fires only when he asked to delete, forget or remove something.
 */
const ASKS_TO_DELETE_RE =
  /(წაშალ|წავშალ|დაივიწყ|ამოიღ|ამოშალ|მოაშორ|მოხსენ|გააქრ|\bdelete\b|\bremove\b|\bforget\b|\berase\b|удали|убери|забудь|сотри|borra|elimina|olvida|quita)/iu;

export function asksToDelete(ownerLine: string): boolean {
  return ASKS_TO_DELETE_RE.test(ownerLine);
}

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
const CLAIM_WORDS: readonly string[] = [
  'წავშალე',
  'წავშალეთ',
  'წაიშალა',
  'წავიშალე',
  'დავივიწყე',
  'წასაშლელად\\s+მოვნიშნე',
  'მოვხსენი',
  'მოიხსნა',
  'ამოვიღე',
  'ამოვშალე',
  'მოვაშორე',
  'გავასუფთავე',
  'deleted',
  'forgotten',
  'erased',
  '(?:has|have|been|was)\\s+removed',
  'I\\s+(?:have\\s+)?(?:removed|forgot|cleared|erased)',
  'удалил[аи]?',
  'удалено',
  'удал[её]н',
  'убрал[аи]?',
  'ст[её]р',
  'ст[её]рла',
  'забыл[аи]?',
  'borré',
  'borrad[oa]',
  'eliminé',
  'eliminad[oa]',
  'quité',
  'quitad[oa]',
];

const CLAIMS_A_DELETION_RE = new RegExp(
  `(?<![\\p{L}\\p{M}])(?:${CLAIM_WORDS.join('|')})(?![\\p{L}\\p{M}])`,
  'iu',
);

export function claimsADeletion(reply: string): boolean {
  return CLAIMS_A_DELETION_RE.test(reply);
}

export function deletionClaimWithoutTool(
  reply: string,
  toolNamesUsed: readonly string[],
  ownerLine: string,
): boolean {
  return (
    asksToDelete(ownerLine) &&
    claimsADeletion(reply) &&
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
