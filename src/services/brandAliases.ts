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
