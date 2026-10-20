import { instructionNamed } from './goalIntent';
import { introductionTarget } from './introFallback';
import { nameStemOf, ownerAsksForIntroduction, partsOf } from './introInstruction';

/**
 * 4655 rebuilt (the tester's 56014, 0 of 2 with 0226): once the guard let the
 * question to Gela through, the model wrote the owner's introduction part into
 * Gela's one message too („…და ლევანმა გააცნოს ნინო"), so the owner's wish
 * reached a third person. Each person's message carries their own part only:
 * a question that names a person from another part's introduction (its
 * go-between or the one to be met) is refused, and the model sends that part
 * where it belongs.
 *
 * MODEL-FACING (D44): OTHER_PART_REFUSAL needs Misho's yes word for word; it
 * is used only while OWN_PART_ONLY_ON (introInstruction.ts) is on.
 */
export const OTHER_PART_REFUSAL =
  'Not sent: this question also carries what the owner asked of someone else. Send this ' +
  'person only their own part of the owner’s message, in your own words. The other part ' +
  'goes to its own person — an introduction through request_introduction — and is never ' +
  'mentioned to this one.';

/** The people an introduction part names: its go-between and the one to be met. */
function peopleOfIntroduction(part: string): string[] {
  return [instructionNamed(part), introductionTarget(part)].filter(
    (name): name is string => name !== null && name.trim() !== '',
  );
}

/** The introduction verbs the go-between reader can pick up as a name („გამაცნო…"). */
const INTRO_VERB_RE = /^(?:გამაცნ|გაგვაცნ|დამაკავშირ|დაგვაკავშირ|შემაერთ|შეგვაერთ)/u;

/** True when the part names who is to make the introduction, not only whom to meet. */
function namesAGoBetween(part: string): boolean {
  const named = (instructionNamed(part) ?? '').trim();
  return named !== '' && !INTRO_VERB_RE.test(named);
}

/**
 * True when the question to this recipient names someone from an introduction
 * part that is not this recipient's own. Parts are split as the guard splits
 * them; with the split off, nothing is ever caught.
 */
export function questionCarriesAnotherPart(
  ownerLines: readonly string[],
  recipientName: string,
  question: string,
  splitParts: boolean,
): boolean {
  if (!splitParts) return false;
  const own = nameStemOf(recipientName);
  if (own === null) return false;
  const asked = question.toLowerCase();
  // #6361 after 0abb7e47 (the tester's 69958, 61728–30): „კი, სთხოვე გამაცნოს
  // გია" names no go-between — it is this conversation's own introduction, and
  // the one asked to make it is the very person now asked „did Gia call you?".
  // Only a part that names ANOTHER go-between is another person's part.
  const otherIntroductions = partsOf(ownerLines, true).filter(
    (part) =>
      ownerAsksForIntroduction([part]) &&
      !part.toLowerCase().includes(own) &&
      namesAGoBetween(part),
  );
  return otherIntroductions
    .flatMap(peopleOfIntroduction)
    .map(nameStemOf)
    .some((stem) => stem !== null && stem !== own && asked.includes(stem));
}
