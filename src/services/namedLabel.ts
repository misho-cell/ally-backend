import { nameKey } from './tools/transliterate';

/**
 * Does a typed sentence name this phonebook label? Used to decide which ONE
 * person an owner's instruction („ask X …") is about, so a wrong yes is a
 * message to the wrong person and a wrong no is only a refused ask.
 *
 * The whole label, contained in the sentence, as before. Plus one Georgian
 * case, from the tester's 1075 (conversation 31788): a label ending in „-ი"
 * loses it when declined. „ჰკითხე ლაშა მძღოლს" names „ლაშა მძღოლი", and the
 * strict test refused it while the server's own D316 event had already told
 * the model to send. So such a label also matches as its stem followed by a
 * case ending and the end of the word: „მძღოლს", „მძღოლმა", „მძღოლის".
 * Nothing looser: „გიორგი" does not match „გიორგაძეს", because „ა" is not an
 * ending here and a letter follows.
 */
const DROPPED_FINAL = 'ი';
const CASE_ENDINGS: readonly string[] = ['ს', 'მა', 'ის', 'ით', 'ად'];
/**
 * 4291 (box 50631, goal 24061): „დათო ელექტრიკოსსაც ჰკითხე" — „ask Dato the
 * electrician too". The „also" particle rides on the case ending („-საც",
 * „-მაც", „-ისაც"), so the ending was followed by a letter and the owner's
 * own named person was refused by the wave. The particle, and only it, may
 * follow an ending.
 */
const ALSO_PARTICLES: readonly string[] = ['აც', 'ც', ''];
const GEORGIAN_LETTER_RE = /[ა-ჿ]/;

function endsWordAfter(rest: string, ending: string): boolean {
  if (!rest.startsWith(ending)) return false;
  const after = rest.slice(ending.length);
  return ALSO_PARTICLES.some(
    (particle) =>
      after.startsWith(particle) && !GEORGIAN_LETTER_RE.test(after.charAt(particle.length)),
  );
}

function declinedFormIn(sentence: string, stem: string): boolean {
  let from = 0;
  for (let at = sentence.indexOf(stem, from); at !== -1; at = sentence.indexOf(stem, from)) {
    const rest = sentence.slice(at + stem.length);
    if (CASE_ENDINGS.some((ending) => endsWordAfter(rest, ending))) return true;
    from = at + 1;
  }
  return false;
}

export function labelNamedIn(sentence: string, label: string): boolean {
  const text = sentence.toLowerCase();
  const name = label.trim().toLowerCase();
  if (name === '') return false;
  if (text.includes(name)) return true;
  if (!name.endsWith(DROPPED_FINAL)) return false;
  return declinedFormIn(text, name.slice(0, -DROPPED_FINAL.length));
}

/**
 * #6339 (Giorgi, G-085, thread 60691): „ლიკა ოსეფაშვილსაც კითხე" did not name
 * his contact saved as „Lika Osepashvili" — the label is in Latin letters and
 * the sentence in Georgian, so the ask to her was refused five times as
 * „outside the plan" while the plan wall told the model the owner's own words
 * were the permission. A label of two or more words written in Latin letters
 * is named by a Georgian sentence that holds every one of its words, read by
 * sound, each whole or with a case ending (and „-ც" / „-აც") after it.
 */
const LATIN_LETTER_RE = /[a-z]/i;
const LATIN_DROPPED_FINAL = 'i';
const LATIN_CASE_ENDINGS: readonly string[] = ['', 's', 'ma', 'm', 'is', 'it', 'ad'];
const LATIN_ALSO_PARTICLES: readonly string[] = ['', 'ac', 'c'];
const MIN_LABEL_WORDS_ACROSS_SCRIPTS = 2;

function soundKey(text: string): string {
  return nameKey(text).replace(/f/g, 'p');
}

function wordNamedBy(sentenceWord: string, labelWord: string): boolean {
  const stems = labelWord.endsWith(LATIN_DROPPED_FINAL)
    ? [labelWord, labelWord.slice(0, -LATIN_DROPPED_FINAL.length)]
    : [labelWord];
  return stems.some((stem) =>
    LATIN_CASE_ENDINGS.some((ending) =>
      LATIN_ALSO_PARTICLES.some((particle) => sentenceWord === `${stem}${ending}${particle}`),
    ),
  );
}

export function latinLabelNamedInGeorgian(sentence: string, label: string): boolean {
  if (!GEORGIAN_LETTER_RE.test(sentence) || GEORGIAN_LETTER_RE.test(label)) return false;
  if (!LATIN_LETTER_RE.test(label)) return false;
  const labelWords = soundKey(label)
    .split(' ')
    .filter((w) => w !== '');
  if (labelWords.length < MIN_LABEL_WORDS_ACROSS_SCRIPTS) return false;
  const sentenceWords = soundKey(sentence).split(' ');
  return labelWords.every((lw) => sentenceWords.some((sw) => wordNamedBy(sw, lw)));
}
