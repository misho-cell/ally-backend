/**
 * The content guard on engine T15's pointer fallback (ticket 9 task 32.2,
 * first owed 25 August).
 *
 * The T15 spec asked for a classifier that keeps ugly and illegal content out
 * of the empty-search fallback. The v1 shipped with only a field-type denylist
 * (health, money, politics, religion, love, criminal), and the 25 August status
 * said so plainly: "the ugly/illegal content classifier does not exist in this
 * codebase". This is that classifier.
 *
 * Why the field-type list is not enough. Pointers are built from facts where
 * `is_public = false` — precisely the notes fact moderation declined to
 * publish. The field type of "he is a thief" is `note`, not `criminal`, so the
 * denylist never sees it. The text itself never leaves the search function, but
 * the pointer still says this NAMED person is worth asking about the query —
 * and when the query is the slur, the pointer answers it. That is the whole
 * accusation, delivered without a word of it being quoted.
 *
 * Deterministic on purpose. A model call here would cost a round trip on every
 * empty search, would be non-deterministic in tests, and — worst — fails open
 * on a timeout, which is the exact wrong direction for a guard. A lexicon
 * cannot catch everything; it catches the plain cases, always, at no cost, and
 * it is readable by the people who have to trust it.
 *
 * On a miss it fails CLOSED: the pointer is suppressed. A pointer nobody sees
 * costs a missed introduction; a pointer that carries an accusation costs
 * somebody their name. But a guard that fires on innocent words is its own
 * harm, so matching is by word, never by substring — see the two lists.
 */

/**
 * Georgian inflects on the suffix, so these match at the START of a word:
 * ქურდ- catches ქურდი, ქურდია, ქურდები. Latin transliterations of Georgian
 * words live here too, since they inflect the same way.
 */
const INFLECTING_STEMS: readonly string[] = [
  // Criminal accusation
  'ქურდ',
  'qurd',
  'თაღლით',
  'taghlit',
  'taglit',
  'მაფიოზ',
  'mafioz',
  'ნარკოტიკ',
  'narkotik',
  'ნარკომან',
  'narkoman',
  'მაწანწალ',
  // Sexual insult and sexual services
  'ბოზ',
  'მეძავ',
  'medzav',
  'პროსტიტუტ',
  'prostitut',
  'проститут',
  // Slur
  'ძაღლიშვილ',
  'ნაბიჭვარ',
  'nabichvar',
  // Addiction and stigma
  'ლოთ',
  'ალკოჰოლიკ',
  'alkoholik',
  'наркоман',
  'мошенник',
  'шлюх',
];

/**
 * Matched as WHOLE words. Every entry here is a short string that is a real
 * word somewhere else: `вор` is the first syllable of the surname Воробьёв,
 * `boz` of Bozkurt, and `kurd` is an ethnonym, not an accusation — which is
 * why `kurd` never appears in either list, even though it is how ქურდ
 * transliterates. The Georgian stem above catches the Georgian spelling.
 */
const EXACT_WORDS: ReadonlySet<string> = new Set([
  'boz',
  'bozi',
  'вор',
  'воры',
  'thief',
  'thieves',
  'scammer',
  'fraudster',
  'criminal',
  'whore',
  'hooker',
  'faggot',
  'retard',
  'пидор',
  'alcoholic',
  'junkie',
  'алкаш',
  // 'დილერ' / 'dealer' is deliberately absent: „ავტო დილერი" is somebody's job.
]);

/** Split on everything that is not a letter or a digit. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
}

function anyWordIsUnsafe(tokens: readonly string[]): boolean {
  return tokens.some(
    (token) => EXACT_WORDS.has(token) || INFLECTING_STEMS.some((stem) => token.startsWith(stem)),
  );
}

/**
 * Does this text carry a plainly ugly or criminal accusation?
 *
 * Used two ways on the pointer path: a query that asks it gets no pointers at
 * all, and a fact that contains it never makes its subject a pointer.
 */
export function isUnsafeContent(text: string): boolean {
  if (!text) return false;
  return anyWordIsUnsafe(words(text));
}

/** The whole query, so a slur spread across words is caught as well as one word. */
export function isUnsafeQuery(queryWords: readonly string[]): boolean {
  return isUnsafeContent(queryWords.join(' '));
}
