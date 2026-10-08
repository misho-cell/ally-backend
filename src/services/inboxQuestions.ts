import { nameKey } from './tools/transliterate';

/**
 * 3367 (conv 45133). „რა არის ახალი?": check_my_inbox found two questions
 * from other people, and the reply was „ახალი არაფერია." A question the owner
 * is not told about is never answered, so the server lists the ones a reply
 * leaves out, after it, as their own card.
 *
 * The tester's 47065 (3367 FAIL): the reply named both askers and the card
 * listed them again. They were saved in Latin letters („Netai Test 3367
 * Reader 1") and the reply wrote them in Georgian ones; and both shared the
 * first word. A name is now looked for in both alphabets, and when two askers
 * share a first name, by more of it.
 */
export interface InboxQuestion {
  readonly from: string;
  readonly question: string;
}

/** A word this long or longer may lose its last letter to a case ending. */
const NAME_STEM_MIN = 4;

/** Letters and digits only, lowercased: how a name is looked for in a reply. */
function lettersOnly(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function stemOf(word: string): string {
  return word.length >= NAME_STEM_MIN ? word.slice(0, -1) : word;
}

/** The reply in its own letters and in Latin letters, each squeezed to letters and digits. */
function readings(reply: string): readonly string[] {
  return [lettersOnly(reply), lettersOnly(nameKey(reply))];
}

/** Whether every one of these words (stemmed) is in the reply, in either alphabet. */
function saysAll(said: readonly string[], words: readonly string[]): boolean {
  return words.every((word) => {
    const own = stemOf(lettersOnly(word));
    const latin = stemOf(lettersOnly(nameKey(word)));
    return own === '' || said.some((s) => s.includes(own) || (latin !== '' && s.includes(latin)));
  });
}

/**
 * The words of a name that tell this asker apart: the first one, and when
 * another asker shares it, also the words the others do not have („Reader 1"
 * against „Reader 2" is told by „1").
 */
function tellingWords(from: string, all: readonly InboxQuestion[]): string[] {
  const words = from
    .trim()
    .split(/\s+/u)
    .filter((w) => w !== '');
  const first = lettersOnly(words[0] ?? '');
  const others = all
    .filter((q) => q.from !== from)
    .map((q) => q.from.trim().split(/\s+/u).map(lettersOnly))
    .filter((otherWords) => otherWords[0] === first);
  if (others.length === 0) return words.slice(0, 1);
  const own = words.slice(1).filter((w) => others.every((o) => !o.includes(lettersOnly(w))));
  return [words[0], ...own];
}

/** The questions whose askers the finished reply never named. */
export function questionsTheReplyLeftOut(
  questions: readonly InboxQuestion[],
  reply: string,
): InboxQuestion[] {
  const said = readings(reply);
  return questions.filter((q) => !saysAll(said, tellingWords(q.from, questions)));
}
