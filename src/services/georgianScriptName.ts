import { query } from '../db/postgres/client';
import { georgianFirstNameOf } from './ownerNameGeorgian';
import { learnSurnameSpellings, learnedSurnameSpelling } from './surnameSpelling';
import { hasGeorgian, latinToGeorgian, nameKey } from './tools/transliterate';

/**
 * #6352 / #6353 (Giorgi's wordings, Misho's yes 20 Oct): a name the owner reads
 * in a Georgian line is written in Georgian script and never carries „Ally"
 * (D583). Owners saved many members as „<Name> Ally" in the old app, and those
 * labels reached the owner as „ახლა ვწერ ასისტენტებს: Lika Osepashvili Ally".
 *
 * A first name comes from the names list (ownerNameGeorgian: one spelling per
 * Latin key, so „Lika" is ლიკა and never ლიქა). Any other word is read by rule
 * only when the rule cannot be wrong.
 *
 * #6767 (Giorgi, 20 Oct): „Giorgi Turashvili" came out „გიორგი თურაშვილი" — the
 * rule reads every „t" as თ, and he is ტურაშვილი. Latin t, k, p, c (and so ts,
 * ch) each stand for two Georgian letters; the same rule made Osepashvili
 * „ოსეპაშვილი" for ოსეფაშვილი. Such a word takes the spelling the base's
 * Georgian labels use (G-157, surnameSpelling); D859 keeps it in Georgian
 * script even when the base has none.
 * An acronym („TBC") or a word with digits is left as written.
 */
const ALLY_WORD_RE = /^ally$/iu;
const WORD_SPLIT_RE = /\s+/u;
const LATIN_NAME_WORD_RE = /^[A-Za-z][A-Za-z'-]*$/u;
const ACRONYM_RE = /^[A-Z]{2,}$/u;
/** Digraphs with one Georgian letter each; what is left of a word after them must be sure. */
const SURE_DIGRAPHS_RE = /kh|sh|zh|gh|dz|th|ph/gu;
const TWO_WAY_LETTER_RE = /[tkpc]/u;

/** The label without the old app's „Ally" word. */
export function withoutAllyWord(name: string): string {
  return name
    .trim()
    .split(WORD_SPLIT_RE)
    .filter((word) => !ALLY_WORD_RE.test(word))
    .join(' ');
}

/** True when the rule spells this Latin word one way only. */
function ruleIsSure(word: string): boolean {
  return !TWO_WAY_LETTER_RE.test(word.toLowerCase().replace(SURE_DIGRAPHS_RE, ''));
}

/** A Latin name word only the base can spell: not an acronym, not listed, not sure by rule. */
function needsTheBase(word: string, isFirst: boolean): boolean {
  if (!LATIN_NAME_WORD_RE.test(word) || ACRONYM_RE.test(word)) return false;
  if (isFirst && georgianFirstNameOf(word) !== null) return false;
  return !ruleIsSure(word);
}

/**
 * The word in Georgian script. G-157: a word the rule cannot be sure of takes
 * the spelling the base uses for it (surnameSpelling), once learned. D859
 * (the founder, 20 Oct): Georgian script always — with nothing learned, the
 * rule's reading, a lone „k" read as კ as in Georgian surnames (Kapanadze,
 * Kvaratskhelia); „kh" stays ხ.
 */
const RULE_K = 'ქ';
const NAME_K = 'კ';

function wordInGeorgian(word: string, isFirst: boolean): string {
  if (!LATIN_NAME_WORD_RE.test(word) || ACRONYM_RE.test(word)) return word;
  const listed = isFirst ? georgianFirstNameOf(word) : null;
  if (listed !== null) return listed;
  if (ruleIsSure(word)) return latinToGeorgian(word);
  return learnedSurnameSpelling(word) ?? latinToGeorgian(word).split(RULE_K).join(NAME_K);
}

/** Learns, from the base, the spelling of every word in these names the rule cannot be sure of. */
export async function learnGeorgianSpellings(names: readonly string[]): Promise<void> {
  const words = names
    .map(withoutAllyWord)
    .filter((name) => name !== '' && !hasGeorgian(name))
    .flatMap((name) => name.split(WORD_SPLIT_RE).filter((w, i) => needsTheBase(w, i === 0)));
  if (words.length > 0) await learnSurnameSpellings(words);
}

/** A Georgian surname's ending, on the last word of a capitalised label. */
const SURNAME_END_RE = /(?:dze|shvili|ia|ua|ava|uri|iani|eli|ani)$/iu;
const CAPITALISED_RE = /^[A-Z]/u;

/**
 * #7231 (tester 73758): „Mechanic BMW service" came out „მეჩანიც BMW სერვიცის"
 * — English words spelt letter by letter. D859 is about names: a label is
 * written in Georgian script when it reads as a person's name (a listed first
 * name first, or capitalised words ending in a Georgian surname); any other
 * label keeps the owner's own Latin.
 */
export function readsAsAName(clean: string): boolean {
  const words = clean.split(WORD_SPLIT_RE).filter((w) => w !== '');
  if (words.length === 0) return false;
  if (georgianFirstNameOf(words[0]) !== null) return true;
  const last = words[words.length - 1];
  return (
    words.length >= 2 && words.every((w) => CAPITALISED_RE.test(w)) && SURNAME_END_RE.test(last)
  );
}

/** The name as a Georgian line writes it: no „Ally", Georgian script for a name (D859). */
export function georgianScriptName(name: string): string {
  const clean = withoutAllyWord(name);
  if (clean === '' || hasGeorgian(clean) || !readsAsAName(clean)) return clean;
  const words = clean.split(WORD_SPLIT_RE);
  const listedFirst = georgianFirstNameOf(words[0] ?? '') !== null;
  return words
    .map((word, index) =>
      isNameWord(word, index, listedFirst) ? wordInGeorgian(word, index === 0) : word,
    )
    .join(' ');
}

/**
 * #7231 retest (tester 73766, 6/6): „Levan BMW mechanic" came out „ლევან BMW
 * მეჩანიც" — the label opens on a name, so every word was spelt in Georgian.
 * After a listed first name, a word goes into Georgian script only when it is
 * a surname (capitalised, a Georgian surname's ending); „mechanic",
 * „dentist" stay as the owner wrote them. A label read as a name by its
 * surname alone is all name.
 */
function isNameWord(word: string, index: number, listedFirst: boolean): boolean {
  if (!listedFirst || index === 0) return true;
  return CAPITALISED_RE.test(word) && SURNAME_END_RE.test(word);
}

/** The first name only, as a Georgian line writes it. */
export function georgianFirstName(name: string): string {
  const first = withoutAllyWord(name).split(WORD_SPLIT_RE)[0] ?? '';
  if (first === '' || hasGeorgian(first)) return first;
  return wordInGeorgian(first, true);
}

/**
 * The rule cannot know that Chikovani is ჩიქოვანი and Kapanadze კაპანაძე. The
 * base can: other members saved the same number in Georgian. So the spelling
 * most of them used is taken first — only when it is the same name by sound
 * (same surname, same start of the first name), so a „მამა" or a nickname
 * never replaces the name. The rule above is the fallback.
 */
const SPELLINGS_TIMEOUT_MS = 3_000;
const MAX_SPELLINGS_READ = 200;
const FIRST_NAME_PREFIX = 3;

interface SpellingRow {
  readonly label: string;
  readonly georgian: string;
  readonly n: number;
}

function sameNameBySound(georgian: string, label: string): boolean {
  const a = nameKey(georgian).split(' ');
  const b = nameKey(label).split(' ');
  if (a.length < 2 || b.length < 2) return false;
  return (
    a[a.length - 1] === b[b.length - 1] &&
    a[0].slice(0, FIRST_NAME_PREFIX) === b[0].slice(0, FIRST_NAME_PREFIX)
  );
}

async function spellingsInTheBase(
  ownerId: string,
  labels: readonly string[],
): Promise<readonly SpellingRow[]> {
  const result = await query<SpellingRow>(
    `WITH mine AS (
       SELECT DISTINCT ON (alias) alias, phone FROM "UserAlias"
        WHERE "contactId" = $1::int AND alias = ANY($2::text[])
        ORDER BY alias, created_at
     )
     SELECT m.alias AS label, TRIM(a.alias) AS georgian, COUNT(*)::int AS n
       FROM mine m
       JOIN "UserAlias" a
         ON a.phone IN (m.phone, '+' || regexp_replace(m.phone, '\\D', '', 'g'),
                        regexp_replace(m.phone, '\\D', '', 'g'))
      WHERE a.alias ~ '[ა-ჰ]'
      GROUP BY m.alias, TRIM(a.alias)
      ORDER BY m.alias, n DESC
      LIMIT $3`,
    [ownerId, labels, MAX_SPELLINGS_READ],
    SPELLINGS_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Each of the owner's labels as a Georgian line writes it: the base's Georgian
 * spelling of that person when there is one, else the rule. A failed read
 * falls back to the rule for all of them.
 */
export async function georgianNamesFor(
  ownerId: string,
  labels: readonly string[],
): Promise<Map<string, string>> {
  const named = new Map(labels.map((label) => [label, georgianScriptName(label)]));
  const latin = labels.filter((label) => !hasGeorgian(withoutAllyWord(label)));
  if (latin.length === 0) return named;
  const spelledByPeople = new Set<string>();
  try {
    for (const row of await spellingsInTheBase(ownerId, latin)) {
      if (spelledByPeople.has(row.label)) continue;
      const spelled = withoutAllyWord(row.georgian);
      if (!sameNameBySound(spelled, withoutAllyWord(row.label))) continue;
      named.set(row.label, spelled);
      spelledByPeople.add(row.label);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[georgian-name] base spellings not read:', (err as Error).message);
  }
  // G-157: what nobody saved in Georgian for this very number is spelled as the base spells the word.
  const left = latin.filter((label) => !spelledByPeople.has(label));
  await learnGeorgianSpellings(left);
  for (const label of left) named.set(label, georgianScriptName(label));
  return named;
}
