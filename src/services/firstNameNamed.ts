import { AMBIGUOUS_FIRST_NAMES, GEORGIAN_FIRST_NAMES } from './georgianFirstNames';

/** How many letters a Georgian case ending may add to a name („ნიკას", „გიორგიმ", „ნინოსთან"). */
const CASE_ENDING_MAX_CHARS = 4;
const MIN_NAME_CHARS = 3;
const WORD_RE = /\p{L}+/gu;

/** The first name a word is, in its plain form, or null („ნიკას" → „ნიკა"). */
function firstNameOf(word: string): string | null {
  const lower = word.toLowerCase();
  if (AMBIGUOUS_FIRST_NAMES.has(lower)) return null;
  if (GEORGIAN_FIRST_NAMES.has(lower)) return lower;
  for (let cut = 1; cut <= CASE_ENDING_MAX_CHARS; cut += 1) {
    const base = lower.slice(0, -cut);
    if (base.length < MIN_NAME_CHARS) return null;
    if (AMBIGUOUS_FIRST_NAMES.has(base)) return null;
    if (GEORGIAN_FIRST_NAMES.has(base)) return base;
  }
  return null;
}

/**
 * 4357 (tester box 51184, conv 49179): the first names a line names, in their
 * plain form. „ჰკითხე ნიკას" names „ნიკა" — the person whose label is „ნიკა
 * ხელოსანი" — which the whole-label match cannot see.
 */
export function firstNamesIn(line: string): string[] {
  const names = (line.match(WORD_RE) ?? [])
    .map(firstNameOf)
    .filter((name): name is string => name !== null);
  return [...new Set(names)];
}
