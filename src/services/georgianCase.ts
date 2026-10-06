// Ticket 6 small-list item 27: server templates suffixed Georgian names with
// a hyphen („გიორგი ბერიძე-ის ასისტენტი", „დათო წიკლაური-ზე") — broken
// Georgian on every recipient opening and every introduction outcome. Names
// decline regularly by their final vowel; anything else (Latin script,
// consonant-final) keeps the hyphen, which is at least unambiguous.

export type GeoCase = 'gen' | 'erg' | 'dat' | 'on';

const HYPHEN_SUFFIX: Record<GeoCase, string> = { gen: '-ის', erg: '-მ', dat: '-ს', on: '-ზე' };

/**
 * #1750 (tester 40624, 40921): the go-between read „გააცნო გიორგს" and the
 * owner „გიორგზე". A surname drops its final -ი (წიკლაური → წიკლაურს), and so
 * does a given name whose -ი is only the nominative ending (ლევანი → ლევანს);
 * but in these given names the -ი is the stem itself, and it stays:
 * გიორგი → გიორგის, გიორგიმ, გიორგიზე.
 */
const VOWEL_STEM_I_NAMES: ReadonlySet<string> = new Set([
  'გიორგი',
  'ირაკლი',
  'გოგი',
  'ანი',
  'ქეთი',
  'ნათი',
  'ნატი',
  'თაკი',
  'მაკი',
  'ლიკი',
  'სოფი',
  'ეკი',
  'ნინი',
  'მარი',
  'ბექი',
]);

function declineVowelStem(word: string, c: GeoCase): string {
  return c === 'gen' || c === 'dat' ? word + 'ს' : c === 'erg' ? word + 'მ' : word + 'ზე';
}

function declineLastWord(word: string, c: GeoCase): string | null {
  const last = word.slice(-1);
  const stem = word.slice(0, -1);
  if (VOWEL_STEM_I_NAMES.has(word)) return declineVowelStem(word, c);
  switch (last) {
    case 'ე': // კახიძე → კახიძის, კახიძემ, კახიძეს, კახიძეზე
      return c === 'gen'
        ? stem + 'ის'
        : c === 'erg'
          ? word + 'მ'
          : c === 'dat'
            ? word + 'ს'
            : word + 'ზე';
    case 'ი': // წიკლაური → წიკლაურის, წიკლაურმა, წიკლაურს, წიკლაურზე
      return c === 'gen'
        ? stem + 'ის'
        : c === 'erg'
          ? stem + 'მა'
          : c === 'dat'
            ? stem + 'ს'
            : stem + 'ზე';
    case 'ა': // შალვა → შალვას, შალვამ, შალვას, შალვაზე
    case 'ო':
    case 'უ': // მიშო → მიშოს, მიშომ, მიშოს, მიშოზე
      return declineVowelStem(word, c);
    default:
      return null;
  }
}

/**
 * A Georgian personal name in the given case — declining the LAST word only
 * („დათო წიკლაური" → „დათო წიკლაურის"). Falls back to the hyphen form when
 * the name does not end in a Georgian vowel.
 */
export function geoName(name: string, c: GeoCase): string {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/);
  const last = words[words.length - 1];
  if (/[ა-ჿ]$/.test(last)) {
    const declined = declineLastWord(last, c);
    if (declined !== null) return [...words.slice(0, -1), declined].join(' ');
  }
  return trimmed + HYPHEN_SUFFIX[c];
}
