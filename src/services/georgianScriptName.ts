import { query } from '../db/postgres/client';
import { georgianFirstNameOf } from './ownerNameGeorgian';
import { hasGeorgian, latinToGeorgian, nameKey } from './tools/transliterate';

/**
 * #6352 / #6353 (Giorgi's wordings, Misho's yes 20 Oct): a name the owner reads
 * in a Georgian line is written in Georgian script and never carries „Ally"
 * (D583). Owners saved many members as „<Name> Ally" in the old app, and those
 * labels reached the owner as „ახლა ვწერ ასისტენტებს: Lika Osepashvili Ally".
 *
 * A first name comes from the names list (ownerNameGeorgian: one spelling per
 * Latin key, so „Lika" is ლიკა and never ლიქა). Anything else is read by rule,
 * with one correction: in a Latin-written Georgian name a lone „k" is კ
 * (Kapanadze, Kvaratskhelia), so the rule's ქ is turned into კ; „kh" stays ხ.
 * An acronym („TBC") or a word with digits is left as written.
 */
const ALLY_WORD_RE = /^ally$/iu;
const WORD_SPLIT_RE = /\s+/u;
const LATIN_NAME_WORD_RE = /^[A-Za-z][A-Za-z'-]*$/u;
const ACRONYM_RE = /^[A-Z]{2,}$/u;
const RULE_K = 'ქ';
const NAME_K = 'კ';

/** The label without the old app's „Ally" word. */
export function withoutAllyWord(name: string): string {
  return name
    .trim()
    .split(WORD_SPLIT_RE)
    .filter((word) => !ALLY_WORD_RE.test(word))
    .join(' ');
}

function wordInGeorgian(word: string, isFirst: boolean): string {
  if (!LATIN_NAME_WORD_RE.test(word) || ACRONYM_RE.test(word)) return word;
  const listed = isFirst ? georgianFirstNameOf(word) : null;
  return listed ?? latinToGeorgian(word).split(RULE_K).join(NAME_K);
}

/** The name as a Georgian line writes it: no „Ally", Georgian script. */
export function georgianScriptName(name: string): string {
  const clean = withoutAllyWord(name);
  if (clean === '' || hasGeorgian(clean)) return clean;
  return clean
    .split(WORD_SPLIT_RE)
    .map((word, index) => wordInGeorgian(word, index === 0))
    .join(' ');
}

/** The first name only, as a Georgian line writes it. */
export function georgianFirstName(name: string): string {
  return georgianScriptName(name).split(WORD_SPLIT_RE)[0] ?? '';
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
  try {
    for (const row of await spellingsInTheBase(ownerId, latin)) {
      const spelled = withoutAllyWord(row.georgian);
      if (named.get(row.label) !== georgianScriptName(row.label)) continue;
      if (sameNameBySound(spelled, withoutAllyWord(row.label))) named.set(row.label, spelled);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[georgian-name] base spellings not read:', (err as Error).message);
  }
  return named;
}
