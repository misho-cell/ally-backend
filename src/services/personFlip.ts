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
/**
 * 2579 (ask 16678, 8 Oct): „იცნობს თუ არა კარგ ბუღალტერს." went to the helper
 * about the helper, in the third person. The editor wrote „იცნობ კარგ
 * ბუღალტერს?" and this check threw it away. A question that OPENS with
 * „knows" has nobody before it who could know: it is about the reader, and
 * „you" is the fix, not the fault.
 */
const ABOUT_THE_READER_OPENINGS: ReadonlySet<string> = new Set(['იცნობს']);

/**
 * The 1850 evening card (box 48942, 15:01:57Z): „ხომ არ იცნობს კარგ
 * ბუღალტერს." — the same question with „ხომ არ" in front, and the editor's
 * „you" was thrown away again („sent as written — the rewrite was not
 * usable"). Question particles put nobody before the verb, so they are passed
 * over when finding what the question opens with.
 */
const QUESTION_PARTICLES: ReadonlySet<string> = new Set([
  'ხომ',
  'არ',
  'ვერ',
  'თუ',
  'ნეტა',
  'იქნებ',
]);

function openingVerb(draft: string): string | undefined {
  return (draft.match(GEORGIAN_WORD_RE) ?? []).find((word) => !QUESTION_PARTICLES.has(word));
}

function opensAboutTheReader(draft: string): boolean {
  const words = draft.match(GEORGIAN_WORD_RE) ?? [];
  const opening = openingVerb(draft);
  if (opening === undefined || !ABOUT_THE_READER_OPENINGS.has(opening)) return false;
  // Only particles before it — and the draft starts with Georgian, not a name in another script.
  return draft.trimStart().startsWith(words[0] ?? '');
}

/**
 * 47987 (ask 17755): „კარგ სანტექნიკოსს ხომ ვერ მირჩევს." went to the helper
 * as written — the editor's „მირჩევ" was thrown away here. „მი-რჩევს" carries
 * the „me" object: he recommends ME, the owner. In a question the owner sends
 * to the helper, the one doing something for „me" is the reader, so „you" is
 * the fix. The object „me" is „მ" + ა/ი/ე, after an optional preverb:
 * მირჩევს, გამაცნობს. „მუშაობს" never matches; „მიაქვს" (carries) and
 * „მიიწევს" (moves on) start the same way and are named as exceptions.
 */
const ME_OBJECT_VERB_RE = /^(?:გა|შე|და|მო|წა|ჩა|გადა|გამო)?მ[აიე]\p{L}{3,}ს$/u;
const NOT_ME_OBJECT: ReadonlySet<string> = new Set(['მიაქვს', 'მიიწევს']);

function doesSomethingForMe(word: string): boolean {
  return ME_OBJECT_VERB_RE.test(word) && !NOT_ME_OBJECT.has(word);
}

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
  if (opensAboutTheReader(draft)) return false;
  const before = georgianWords(draft);
  const after = georgianWords(rewrite);
  for (const word of before) {
    if (doesSomethingForMe(word)) continue;
    const you = youForm(word);
    if (you !== null && after.has(you) && !after.has(word)) return true;
  }
  return false;
}
