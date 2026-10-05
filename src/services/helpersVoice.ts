import { factNumbersOf, isFirstName, linksIn, placesOf } from './answerFacts';

/**
 * D648 (the founder, box 37654: „nothing, even tone of voice goes out"): the
 * helper's answer reaches the owner as their assistant's report about them,
 * never in their own voice and never with more than they said. The tester's
 * 1156 showed both on one card (38777):
 *
 *   „ინგლისურ ენას ვასწავლი, 2015 წლიდან … ვასწავლი 51-ე საჯარო სკოლაში,
 *    ვაკეში."
 *
 * — the words moved, but „ვასწავლი" is still her speaking, and „ვაკეში" is
 * not in what she wrote: her assistant took it from what it knows of her.
 */

/** A word of the helper's that marks them speaking: Georgian's first person starts with „ვ". */
const FIRST_PERSON_RE = /^ვ\p{L}{3,}$/u;
/** „ვ" words that are not a first-person verb: „ვერ…", „ვინ…", „ვიღაც", „ვიდრე", „ვითომ". */
const NOT_FIRST_PERSON_RE = /^(?:ვერ|ვინ|ვიღ|ვიდრე|ვითომ)/u;
const WORD_RE = /\p{L}+/gu;

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

/**
 * The helper's first-person words the sent answer repeats. A „ვ" word the
 * question also uses is the topic („ვეტერინარი"), not the helper's voice, and a
 * place or a name is a fact.
 */
export function firstPersonCarried(helperLine: string, question: string, sent: string): string[] {
  const asked = new Set(wordsOf(question));
  const sentWords = new Set(wordsOf(sent));
  const carried = wordsOf(helperLine).filter(
    (word) =>
      FIRST_PERSON_RE.test(word) &&
      !NOT_FIRST_PERSON_RE.test(word) &&
      !asked.has(word) &&
      placesOf(word).size === 0 &&
      !isFirstName(word) &&
      sentWords.has(word),
  );
  return [...new Set(carried)];
}

/**
 * Places, numbers and links in the sent answer that neither the helper's line
 * nor the question has: facts the assistant added on its own.
 */
export function factsAdded(helperLine: string, question: string, sent: string): string[] {
  const known = `${helperLine}\n${question}`;
  const knownPlaces = placesOf(known);
  const knownText = known.toLowerCase();
  const places = [...placesOf(sent)].filter(([at]) => !knownPlaces.has(at)).map(([, w]) => w);
  const knownNumbers = new Set(factNumbersOf(known));
  const numbers = factNumbersOf(sent).filter((n) => !knownNumbers.has(n));
  const links = linksIn(sent).filter((link) => !knownText.includes(link));
  return [...new Set([...places, ...numbers, ...links])];
}

export function firstPersonRefusal(words: readonly string[]): string {
  return (
    `Not sent: „${words.join('", „')}" is the helper speaking in the first person, so the owner ` +
    "reads it as the helper's own words. D648: report what they said as their assistant, in " +
    'the third person (they teach → „ასწავლის", not „ვასწავლი"), every fact exact, and send again.'
  );
}

export function factsAddedRefusal(added: readonly string[]): string {
  return (
    `Not sent: ${added.join(', ')} is not in the helper's answer or in the question. D648: pass on ` +
    'only what the helper said — nothing you know about them from elsewhere. Leave it out and send again.'
  );
}

/**
 * #1488 (L23, conversation 39345): the helper typed only „ნანა სტომატოლოგი"
 * and the owner's card read „კარგი სტომატოლოგია ნანა, მას ვურჩევ" — praise and
 * a recommendation she never wrote, in her voice. A word of praise or of
 * recommending in the sent answer whose stem is nowhere in her line was added.
 */
const ENDORSEMENT_STEMS: readonly string[] = [
  'ვურჩევ',
  'გირჩევ',
  'რეკომენდ',
  // Tester 40162: „…და შეძლებს დაგეხმაროს" — a promise of help she did not make.
  'დაგეხმარ',
  'დაეხმარ',
  'კარგ',
  'საუკეთესო',
  'სანდო',
  'შესანიშნავ',
  'recommend',
  'good',
  'great',
  'best',
  'trusted',
  'reliable',
  'help',
  'рекоменд',
  'хорош',
  'лучш',
  'помож',
];

export function endorsementAdded(helperLine: string, sent: string): string[] {
  const own = helperLine.toLowerCase();
  const added = wordsOf(sent).filter((word) =>
    ENDORSEMENT_STEMS.some((stem) => word.startsWith(stem) && !own.includes(stem)),
  );
  return [...new Set(added)];
}

export function endorsementAddedRefusal(words: readonly string[]): string {
  return (
    `Not sent: „${words.join('", „')}" — praise or a recommendation the helper did not write. ` +
    'D648: pass on only what they said, in the third person; a name and a profession stay ' +
    'just that. Leave it out and send again.'
  );
}
