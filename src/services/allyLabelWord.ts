/**
 * #6352 retest (the tester's 69803 / 69804, Misho's yes 20 Oct; D583): owners
 * saved many members as „<Name> Ally" in the old app, and that word kept
 * reaching the owner in lines the sent-line fix does not write — the plan
 * sentence, the evening note, „ლევან Ally-ისთვის გაიგზავნა გაცნობის მოთხოვნა".
 *
 * So every assistant line drops the word where it follows a name, and a
 * Georgian case ending that hung on it („Ally-ისთვის") goes back onto the name
 * the way Georgian writes it: ლევან + ისთვის → ლევანისთვის; ლიკა + ის → ლიკას;
 * კახიძე + ის → კახიძის; გიორგი + ის → გიორგის. A Latin name keeps the hyphen.
 */
const ALLY_AFTER_NAME_RE = /(\p{L}+)\s+Ally(?=$|[\s\-.,!?;:)»"„“])(?:-([ა-ჰ]+))?/gu;
const GEORGIAN_RE = /[ა-ჰ]/u;
const GENITIVE = 'ის';
const OPEN_VOWELS: ReadonlySet<string> = new Set(['ა', 'ო', 'უ']);

/** A Georgian name with its case ending put back on („ლიკა" + „ისთვის" → „ლიკასთვის"). */
export function withGeorgianEnding(name: string, ending: string): string {
  const last = name.slice(-1);
  if (!ending.startsWith(GENITIVE)) return name + ending;
  const after = ending.slice(GENITIVE.length);
  if (OPEN_VOWELS.has(last)) return `${name}ს${after}`;
  if (last === 'ი' || last === 'ე') return `${name.slice(0, -1)}${ending}`;
  return name + ending;
}

/** The text with „Ally" gone from after every name, endings rejoined. */
export function withoutAllyLabelWord(text: string): string {
  return text.replace(ALLY_AFTER_NAME_RE, (_match, name: string, ending?: string) => {
    if (ending === undefined) return name;
    return GEORGIAN_RE.test(name) ? withGeorgianEnding(name, ending) : `${name}-${ending}`;
  });
}
