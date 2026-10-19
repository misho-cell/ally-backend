import { normalizeSearchToken } from './tools/normalizeSearchToken';

/**
 * 5446 (the tester's 63559): a case solved in Georgian („თიბისის სესხი") was
 * never found by an English ask („a loan at TBC Bank"): the match compares
 * letters, and „tibisi" is not „tbc". The companies people ask about most are
 * written both ways, so a remembered case carries every common spelling of the
 * company it names.
 */
const BRAND_GROUPS: readonly (readonly string[])[] = [
  ['TBC', 'თიბისი', 'ტიბისი'],
  // The stem, so „საქართველოს ბანკში" and „…ბანკის" match too; the text is never shown.
  ['Bank of Georgia', 'BOG', 'საქართველოს ბანკ'],
  ['Liberty', 'ლიბერთი'],
  ['Basisbank', 'ბაზისბანკი'],
  ['ProCredit', 'პროკრედიტ'],
  ['Credo', 'კრედო'],
  ['Magti', 'მაგთი'],
  ['Silknet', 'სილქნეტი'],
];

/** Every spelling, normalized the way the database compares, longest first per group. */
const NORMALIZED_GROUPS = BRAND_GROUPS.map((group) =>
  group.map((name) => ({ name, key: normalizeSearchToken(name) })),
);

/** The text with every other spelling of each company it names appended; unchanged otherwise. */
export function withBrandAliases(text: string): string {
  const key = normalizeSearchToken(text);
  const added = NORMALIZED_GROUPS.flatMap((group) => {
    if (!group.some((member) => key.includes(member.key))) return [];
    return group.filter((member) => !key.includes(member.key)).map((member) => member.name);
  });
  return added.length === 0 ? text : `${text} ${added.join(' ')}`;
}

/** A Georgian case ending on a company's name („თიბისის", „თიბისიში"). */
const MAX_ENDING_CHARS = 3;
/** Shorter keys are matched whole, never as the start of a longer word. */
const MIN_PREFIX_KEY_CHARS = 3;
const SPACE_RE = /\s/u;

function namesBrand(key: string, member: { readonly key: string }): boolean {
  if (key === member.key) return true;
  return (
    member.key.length >= MIN_PREFIX_KEY_CHARS &&
    key.startsWith(member.key) &&
    key.length - member.key.length <= MAX_ENDING_CHARS
  );
}

/**
 * #1849 world Q (the tester's 68806, Q3 60334): three friends saved the TBC
 * SME lending head as „TBC SME lending head"; the run searched „თიბისი ბანკი"
 * and found nobody — a spelled-out acronym is not a transliteration. One word
 * of a search that names a company gets that company's other one-word
 * spellings beside it. Several-word names („Bank of Georgia") stay out: one
 * word of them alone would match far too much.
 */
export function otherBrandSpellings(word: string): string[] {
  const key = normalizeSearchToken(word.trim());
  if (key === '') return [];
  return NORMALIZED_GROUPS.flatMap((group) => {
    const single = group.filter((member) => !SPACE_RE.test(member.name));
    if (!single.some((member) => namesBrand(key, member))) return [];
    return single.filter((member) => !namesBrand(key, member)).map((member) => member.name);
  });
}
