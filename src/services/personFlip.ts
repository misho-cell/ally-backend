/**
 * #2212, turn 5 (the tester's 44884, 0 of 3 after ce196de): the model wrote
 * „შაბათსაც მუშაობს?" about the craftsman the owner named, and the editor sent
 * the helper „შაბათობითაც მუშაობ?" — the third person turned into „you". The
 * editor's prompt already says not to (rule 1); this is the server's own check,
 * so a rewrite that does it anyway is not used and the model's text goes.
 *
 * A Georgian present-tense verb in the third person ends in „ს" after a
 * consonant (მუშაობს, აკეთებს, იცნობს); the same verb for „you" drops it
 * (მუშაობ, აკეთებ, იცნობ). A name in the dative also ends in „ს", but after a
 * vowel (ზაზას, ნინოს, გიორგის), so it is left alone.
 */
const GEORGIAN_WORD_RE = /[ა-ჺ]+/gu;
const THIRD_PERSON_ENDING = 'ს';
const GEORGIAN_VOWELS = new Set(['ა', 'ე', 'ი', 'ო', 'უ']);
/** Shorter words are mostly particles and postpositions, not verbs. */
const MIN_VERB_CHARS = 4;

function georgianWords(text: string): Set<string> {
  return new Set(text.match(GEORGIAN_WORD_RE) ?? []);
}

/** The „you" form of a third-person verb, or null when the word is not one. */
function youForm(word: string): string | null {
  if (word.length < MIN_VERB_CHARS || !word.endsWith(THIRD_PERSON_ENDING)) return null;
  const stem = word.slice(0, -THIRD_PERSON_ENDING.length);
  return GEORGIAN_VOWELS.has(stem.slice(-1)) ? null : stem;
}

/** True when a verb the draft had in the third person reads as „you" in the rewrite. */
export function thirdPersonTurnedToYou(draft: string, rewrite: string): boolean {
  const before = georgianWords(draft);
  const after = georgianWords(rewrite);
  for (const word of before) {
    const you = youForm(word);
    if (you !== null && after.has(you) && !after.has(word)) return true;
  }
  return false;
}
