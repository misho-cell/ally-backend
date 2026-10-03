/**
 * Board #100 (plate F1): when Netai worded a question for the owner it changed
 * facts. An ask said „for a friend" though the owner asked for himself, and
 * „last year" became „this year". The person asked answers what they read, so
 * a changed fact is a wrong answer delivered politely.
 *
 * Checked in code before a question goes out, against the owner's own lines
 * in the goal's conversation. Two checks, each narrow:
 *
 *   beneficiary  the question says it is for a friend or an acquaintance, and
 *                the owner never mentioned one;
 *   time         the question carries a time word, the owner used time words,
 *                and not this one.
 *
 * A miss costs a question that goes out as today; a false refusal costs one
 * rewrite. Both checks therefore fire only on a word that is plainly there.
 */
const BENEFICIARY_IN_QUESTION_RE =
  /(მეგობრისთვის|მეგობარს\s+(სჭირდება|უნდა|ეძებს)|ჩემს\s+მეგობარს|ჩემი\s+მეგობარი|ნაცნობისთვის|ჩემს\s+ნაცნობს|for\s+a\s+friend|a\s+friend\s+of\s+mine|my\s+friend|для\s+друга|мой\s+друг|моему\s+другу)/iu;

/** The owner naming somebody else at all: a friend, an acquaintance, family. */
const OWNER_NAMES_SOMEONE_ELSE_RE =
  /(მეგობ|ნაცნობ|ძმა|ძმის|დეიდა|მამიდა|ბიძა|მეუღლ|ცოლ|ქმარ|შვილ|\b(friend|acquaint\w*|brother|sister|mother|father|mom|dad|wife|husband|son|daughter|cousin|colleague)s?\b|друг|знаком|брат|сестр|жен|муж)/iu;

/** Time words that name a different moment from each other. */
const TIME_WORDS: readonly (readonly string[])[] = [
  ['შარშან', 'last year', 'в прошлом году'],
  ['წელს', 'ამ წელს', 'this year', 'в этом году'],
  ['გუშინ', 'yesterday', 'вчера'],
  ['დღეს', 'today', 'сегодня'],
  ['ხვალ', 'tomorrow', 'завтра'],
  ['გასულ კვირას', 'წინა კვირას', 'last week', 'на прошлой неделе'],
  ['ამ კვირაში', 'ამ კვირას', 'this week', 'на этой неделе'],
  ['მომავალ კვირას', 'შემდეგ კვირას', 'next week', 'на следующей неделе'],
  ['მომავალ წელს', 'next year', 'в следующем году'],
];

export enum FactChange {
  Beneficiary = 'beneficiary',
  Time = 'time',
}

export interface FactChanged {
  readonly change: FactChange;
  /** The word in the question that the owner did not say. */
  readonly word: string;
}

function lowered(text: string): string {
  return text.toLowerCase();
}

/** The index of each time group the text mentions, and the word it used. */
function timeGroupsIn(text: string): Map<number, string> {
  const found = new Map<number, string>();
  const low = lowered(text);
  TIME_WORDS.forEach((group, index) => {
    const word = group.find((w) => low.includes(w));
    if (word !== undefined) found.set(index, word);
  });
  return found;
}

/** What the question changed from the owner's own lines, or null when it kept them. */
export function factChangedIn(question: string, ownerLines: readonly string[]): FactChanged | null {
  const owner = ownerLines.join('\n');
  const beneficiary = BENEFICIARY_IN_QUESTION_RE.exec(question);
  if (beneficiary !== null && !OWNER_NAMES_SOMEONE_ELSE_RE.test(owner)) {
    return { change: FactChange.Beneficiary, word: beneficiary[0] };
  }
  const ownerTimes = timeGroupsIn(owner);
  if (ownerTimes.size > 0) {
    for (const [group, word] of timeGroupsIn(question)) {
      if (!ownerTimes.has(group)) return { change: FactChange.Time, word };
    }
  }
  return null;
}

/** What the model is told when a question is held back for a changed fact. */
export function factChangedRefusal(changed: FactChanged): string {
  const what =
    changed.change === FactChange.Beneficiary
      ? `it says „${changed.word}", but the owner never said it is for anybody else — they are asking for themselves`
      : `it says „${changed.word}", a time the owner did not give — keep the owner's own time words`;
  return (
    `Not sent: ${what}. Rewrite the question with every fact exactly as the owner wrote it — ` +
    'who it is for, when, where, how much — and add no reason, beneficiary or time of your own. ' +
    'Then send it again. Do not tell the owner about this; it is a rewrite, not news.'
  );
}
