/**
 * 3567 (MASTER TEST RUN SA-013, 2 of 2): the owner typed „ჩემი მეგობარი ლაშა …
 * მძიმე დეპრესიაშია. ჰკითხე <helper>-ს, იცნობს თუ არა კარგ ფსიქოლოგს." The
 * editor folded the owner's words into the question, and the helper read the
 * friend's name AND his illness, in the message and in the conversation title.
 *
 * A question to another person carries the need, never somebody's condition.
 * Deterministic on purpose, like contentGuard: a part of the question that
 * STATES a condition is dropped; the question itself stays, so „do you know a
 * good doctor for diabetes?" still goes out whole.
 */

/** Georgian and Russian inflect on the suffix: these match at the start of a word. */
const CONDITION_STEMS: readonly string[] = [
  'დეპრესი',
  'შიზოფრენ',
  'ბიპოლარ',
  'სიმსივნ',
  'კიბო',
  'ინსულტ',
  'ინფარქტ',
  'დიაბეტ',
  'შიდს',
  'აუტიზმ',
  'აუტისტ',
  'დემენცი',
  'ალცჰაიმერ',
  'პარკინსონ',
  'ეპილეფს',
  'ორსულ',
  'უნაყოფო',
  'სუიციდ',
  'თვითმკვლელ',
  'დაავადებ',
  'ავადაა',
  'ავადმყოფ',
  'ფსიქიკურ',
  'შფოთვ',
  'ალკოჰოლიზ',
  'ნარკომან',
  'депресс',
  'шизофрен',
  'биполяр',
  'опухол',
  'инсульт',
  'инфаркт',
  'диабет',
  'аутизм',
  'деменц',
  'альцгеймер',
  'паркинсон',
  'эпилепс',
  'беремен',
  'бесплод',
  'суицид',
  'болеет',
  'болезн',
  'depress',
  'deprimid',
  'esquizofren',
  'schizophren',
  'embarazad',
  'suicid',
  'alzheimer',
  'parkinson',
  'epilep',
  'demenci',
  'dementia',
  'autism',
  'autistic',
  'autismo',
];

/** Short words that are other words elsewhere: matched whole only. */
const CONDITION_WORDS: ReadonlySet<string> = new Set([
  'აივ',
  'рак',
  'вич',
  'спид',
  'cancer',
  'cáncer',
  'tumor',
  'tumour',
  'hiv',
  'aids',
  'vih',
  'sida',
  'bipolar',
  'diabetes',
  'diabetic',
  'pregnant',
  'infertile',
  'stroke',
  'anxiety',
  'addicted',
  'addiction',
]);

const CLAUSE_SPLIT_RE = /\s*[,;]\s*|\s+[—–-]\s+/u;
const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+/u;
const SENTENCE_END_RE = /[.!?…]+$/u;

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
}

/** Does this text name a health condition? */
export function namesACondition(text: string): boolean {
  return wordsOf(text).some(
    (word) => CONDITION_WORDS.has(word) || CONDITION_STEMS.some((stem) => word.startsWith(stem)),
  );
}

// Mkhedruli has no capitals: upper-casing it gives Mtavruli, which is wrong in running text.
const GEORGIAN_LETTER_RE = /^[\u10D0-\u10FF]/u;

function capitalized(text: string): string {
  if (GEORGIAN_LETTER_RE.test(text)) return text;
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** One sentence without its condition-stating parts; null when nothing of it is left. */
function sentenceWithoutCondition(sentence: string): string | null {
  if (!namesACondition(sentence)) return sentence;
  const end = SENTENCE_END_RE.exec(sentence)?.[0] ?? '';
  const body = sentence.slice(0, sentence.length - end.length);
  const clauses = body.split(CLAUSE_SPLIT_RE).filter((c) => c.trim() !== '');
  const kept = clauses.filter((clause) => !namesACondition(clause));
  if (kept.length > 0) return `${capitalized(kept.join(', ').trim())}${end}`;
  // The whole sentence is the condition. A question keeps it — that is the need
  // itself („…a doctor for diabetes?"); a statement goes.
  return end.includes('?') ? sentence : null;
}

/**
 * The question without the parts that state somebody's condition. Returns the
 * text unchanged when it names none, and null when nothing would be left.
 */
export function withoutConditionStated(question: string): string | null {
  const kept = question
    .trim()
    .split(SENTENCE_SPLIT_RE)
    .map(sentenceWithoutCondition)
    .filter((s): s is string => s !== null && s.trim() !== '');
  return kept.length > 0 ? kept.join(' ') : null;
}
