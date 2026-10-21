import { georgianToLatin } from '../tools/transliterate';

/**
 * D847 — which company a phonebook label names (TECH_TASK_COMPANY_BASE §4).
 * Pure: a label and the name index in, company ids out.
 *
 * A STRONG name links on its own („Nino TBC", „ნინო თიბისი", „Tegetadan
 * Giorgi"). A WEAK name — a place, a word, a short name („Margi") — links only
 * when the same label also carries an organisation or job word („Nino Margi
 * LLC manager"). A name that several companies share links to none.
 */

/** The name index as company_names holds it: normalised name → companies, and whether it is strong. */
export interface IndexedName {
  readonly companyIds: ReadonlySet<string>;
  readonly strong: boolean;
}

export interface NameRow {
  readonly companyId: string;
  readonly nameNormalised: string;
  readonly strength: string;
}

/** Longest company name, in words, the matcher looks for inside a label. */
const MAX_NAME_WORDS = 4;
/** Georgian case endings on a one-word name, as written in Latin: Tegetadan, Tegetashi, Tegetas. */
const CASE_ENDINGS = ['dan', 'shi', 'ze', 'tan', 'it', 'is', 'ma', 's'] as const;
const MIN_STEM_CHARS = 4;

/**
 * The organisation and job words that make a weak name count (§4), in the
 * normalised form labels are matched in.
 */
const SECOND_SIGNAL_WORDS: ReadonlySet<string> = new Set([
  'bank',
  'banki',
  'llc',
  'ltd',
  'jsc',
  'inc',
  'shps',
  'ss',
  'company',
  'kompania',
  'director',
  'direktori',
  'manager',
  'menejeri',
  'accountant',
  'bughalteri',
  'ceo',
  'office',
  'ofisi',
  'group',
  'jgufi',
]);

/** Lower case, Georgian letters in Latin, punctuation gone: the form company_names is keyed by. */
export function normaliseLabel(label: string): string {
  return georgianToLatin(label.toLocaleLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function buildNameIndex(rows: readonly NameRow[]): Map<string, IndexedName> {
  const out = new Map<string, { companyIds: Set<string>; strong: boolean }>();
  for (const row of rows) {
    const key = row.nameNormalised.trim();
    if (key === '') continue;
    const entry = out.get(key) ?? { companyIds: new Set<string>(), strong: false };
    entry.companyIds.add(row.companyId);
    entry.strong = entry.strong || row.strength === 'strong';
    out.set(key, entry);
  }
  return out;
}

/** A word with a Georgian case ending taken off, when what is left is still a name's length. */
function stems(word: string): string[] {
  return CASE_ENDINGS.filter(
    (e) => word.endsWith(e) && word.length - e.length >= MIN_STEM_CHARS,
  ).map((e) => word.slice(0, -e.length));
}

interface Phrase {
  readonly text: string;
  /** The weak-name rule needs an organisation word right before or after the name. */
  readonly besideSignal: boolean;
}

/** Every run of one to four words in the label, longest first, then the one-word stems. */
function phrases(words: readonly string[]): Phrase[] {
  const signal = (i: number): boolean => SECOND_SIGNAL_WORDS.has(words[i] ?? '');
  const out: Phrase[] = [];
  for (let n = Math.min(MAX_NAME_WORDS, words.length); n >= 1; n -= 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      out.push({
        text: words.slice(i, i + n).join(' '),
        besideSignal: signal(i - 1) || signal(i + n),
      });
    }
  }
  words.forEach((w, i) => {
    for (const stem of stems(w))
      out.push({ text: stem, besideSignal: signal(i - 1) || signal(i + 1) });
  });
  return out;
}

/**
 * The companies a label names; empty when it names none, or only ambiguously.
 * A weak name counts only right beside an organisation or job word: in „Nino
 * Margi LLC manager" that is Margi, and not the first name Nino.
 */
export function companiesInLabel(label: string, index: ReadonlyMap<string, IndexedName>): string[] {
  const words = normaliseLabel(label)
    .split(' ')
    .filter((w) => w !== '');
  const found = new Set<string>();
  for (const phrase of phrases(words)) {
    const hit = index.get(phrase.text);
    if (hit === undefined || hit.companyIds.size !== 1) continue;
    if (!hit.strong && !phrase.besideSignal) continue;
    found.add([...hit.companyIds][0]);
  }
  return [...found];
}

/** §4 status: two or more different savers make a label link confirmed; one is possible. */
export function labelLinkStatus(savers: number): 'confirmed' | 'possible' {
  return savers >= 2 ? 'confirmed' : 'possible';
}
