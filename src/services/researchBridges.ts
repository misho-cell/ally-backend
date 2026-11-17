import { query } from '../db/postgres/client';
import { getExcludedPhones } from './block.service';
import { notAnExcludedHolder } from './excludedHolders.service';
import { firmInTheOtherScript } from './openingSearch.service';
import { phonebookPhones } from './tools/searchSecondDegree';
import { toMtavruli } from './tools/georgianCase';
import { normalizeSearchToken } from './tools/normalizeSearchToken';

/**
 * The tester's case, 17 Nov: a firm's head sat in a friend's phonebook under
 * his own name, the friend is the owner's contact, and the firm's name stood
 * on him only in labels other people wrote. The second-circle search reads the
 * labels the friend wrote, so the way in — owner, friend, head — was never
 * seen. Here a person counts when they are in a contact's phonebook (the
 * contact is on Netai) and either (a) anyone at all labelled them with the
 * firm's name, or (b) the contact saved them under a name the web gives as the
 * firm's head.
 *
 * What leaves this module: the name the contact saved them under, the owner's
 * own name for the contact, and the firm the owner's search is about. The
 * labels strangers wrote never leave it — only how many people wrote one.
 */

/** Above the default: these run on the long pool, in the background research (measured 2-3 s). */
const BRIDGE_QUERY_TIMEOUT_MS = 15_000;
/** Labelled numbers read per search; a firm's name on more than this is not a firm. */
const MAX_LABELLED_PHONES = 2_000;
/** People kept per firm or per name. */
const MAX_PEOPLE_PER_KEY = 5;
/** Firms whose people are read at once. */
const FIRMS_READ_AT_ONCE = 2;
/** The Latin „a"s tried as „e" too: two give four spellings, three eight. */
const MAX_HEARD_VOWELS = 3;
const LATIN_WORD_RE = /^[a-z0-9]+$/u;
const MIN_NAME_PART_LETTERS = 2;
const SPACES_RE = /[\s\-_.]+/gu;

export interface ThroughAContact {
  /** As the contact saved them. */
  readonly saved_by_your_contact_as: string;
  /** The owner's own name for that contact. */
  readonly your_contact: string;
}

export interface FirmPerson extends ThroughAContact {
  /** How many people's labels tie them to the firm. */
  readonly labelled_with_the_firm_by: number;
}

export interface HeldRow {
  readonly phone: string;
  readonly saved_as: string;
  readonly bridge: string;
}

/**
 * The firm's spellings, lower case: as found, the other alphabet, any other
 * spelling the caller knows (the site's own name: „ბრენდჰენდი" is brandhand.ge,
 * which no letter-by-letter spelling reaches), and each without spaces.
 */
export function firmSpellings(firm: string, other: readonly string[] = []): string[] {
  const forms = [firm, firmInTheOtherScript(firm), ...other]
    .map((f) => f.trim().toLocaleLowerCase())
    .filter((f) => f !== '');
  const joined = forms.map((f) => f.replace(SPACES_RE, ''));
  const heard = joined.filter((f) => LATIN_WORD_RE.test(f)).flatMap(heardSpellings);
  return [...new Set([...forms, ...joined, ...heard])].filter((f) => [...f].length >= 3);
}

/**
 * The probe, 17 Nov: the head's tie to „Brandhand" was a label written
 * „brendhendi" — as the name sounds in Georgian. An English „a" is heard and
 * written „e" (brand → brend, hand → hend), so the Latin spelling's first few
 * „a"s are tried both ways.
 */
export function heardSpellings(latin: string): string[] {
  let spellings = [''];
  let swapped = 0;
  for (const letter of latin) {
    const both = letter === 'a' && swapped < MAX_HEARD_VOWELS;
    if (both) swapped += 1;
    spellings = spellings.flatMap((s) => (both ? [`${s}a`, `${s}e`] : [`${s}${letter}`]));
  }
  return spellings;
}

/** LIKE patterns for a lower-case word, in ordinary and capital Georgian letters. */
function likePatterns(word: string): string[] {
  const escaped = word.replace(/[\\%_]/gu, (c) => `\\${c}`);
  return [...new Set([`%${escaped}%`, `%${toMtavruli(escaped)}%`])];
}

/**
 * The people the owner's contacts on Netai hold, among the given numbers, with
 * the name each contact saved them under and the owner's own name for the
 * contact. The owner's own contacts and the owner are not in it.
 */
async function heldByContacts(userId: string, phones: readonly string[]): Promise<HeldRow[]> {
  if (phones.length === 0) return [];
  const own = await phonebookPhones(userId);
  if (own.length === 0) return [];
  const result = await query<HeldRow>(
    `WITH bridges AS (
       SELECT DISTINCT up."userId" AS id, up.phone AS bridge_phone
         FROM "UserPhone" up
        WHERE up.phone = ANY($2) AND up."userId" <> $1::int AND ${notAnExcludedHolder('up."userId"')}
     )
     SELECT DISTINCT ON (a.phone, b.id) a.phone, a.alias AS saved_as, oa.alias AS bridge
       FROM "UserAlias" a
       JOIN bridges b ON b.id = a."contactId"
       JOIN "UserAlias" oa ON oa."contactId" = $1::int AND oa.phone = b.bridge_phone
      WHERE a.phone = ANY($3) AND NOT (a.phone = ANY($2))
        AND NOT EXISTS (SELECT 1 FROM "UserPhone" me WHERE me.phone = a.phone AND me."userId" = $1::int)
      LIMIT 200`,
    [userId, own, phones],
    BRIDGE_QUERY_TIMEOUT_MS,
  );
  const blocked = new Set(await getExcludedPhones(userId));
  return result.rows.filter((row) => !blocked.has(row.phone));
}

interface LabelledRow {
  readonly phone: string;
  readonly label: string;
  readonly labellers: string | number;
}

/** Every number anyone labelled with one of the spellings, and by how many people. */
async function labelledWith(spellings: readonly string[]): Promise<LabelledRow[]> {
  const patterns = [...new Set(spellings.flatMap(likePatterns))];
  if (patterns.length === 0) return [];
  // The third probe, 17 Nov, measured live: the same patterns joined by OR left the
  // trigram index and ran past the timeout (17 s); one index read each took 1.9 s.
  // The fourth probe: a common word as a firm's name („print") matched more labels than the
  // timeout allows; each read stops at the limit, which a real firm's people never reach.
  const reads = patterns.flatMap((_, i) => [
    `(SELECT phone, LOWER(alias) AS label, "contactId" AS saver FROM "UserAlias" WHERE LOWER(alias) LIKE $${i + 1} LIMIT ${MAX_LABELLED_PHONES})`,
    `(SELECT phone, LOWER(tag) AS label, "contactId" AS saver FROM "UserTags" WHERE LOWER(tag) LIKE $${i + 1} LIMIT ${MAX_LABELLED_PHONES})`,
  ]);
  const result = await query<LabelledRow>(
    `SELECT phone, MIN(label) AS label, COUNT(DISTINCT saver) AS labellers FROM (
       ${reads.join('\n       UNION ALL\n       ')}
     ) hits
     GROUP BY phone
     LIMIT ${MAX_LABELLED_PHONES}`,
    patterns,
    BRIDGE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** One firm's people the owner's contacts hold, the most corroborated first. */
async function oneFirmsPeople(userId: string, spellings: readonly string[]): Promise<FirmPerson[]> {
  const labelled = await labelledWith(spellings);
  const byPhone = new Map(labelled.map((row) => [row.phone, Number(row.labellers)]));
  const held = await heldByContacts(userId, [...byPhone.keys()]);
  const labellers = (row: HeldRow): number => byPhone.get(row.phone) ?? 0;
  return held
    .sort((a, b) => labellers(b) - labellers(a))
    .slice(0, MAX_PEOPLE_PER_KEY)
    .map((row) => ({
      saved_by_your_contact_as: row.saved_as,
      your_contact: row.bridge,
      labelled_with_the_firm_by: labellers(row),
    }));
}

/**
 * For each firm, the people the owner's contacts hold whom anyone labelled
 * with the firm's name. Each firm is read on its own (the probe, 17 Nov: one
 * read for all twenty filled its limit with the common names' people, and
 * the small firm's were cut); a firm that fails to read has nobody, and says so.
 */
export async function firmPeopleThroughContacts(
  userId: string,
  firms: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, FirmPerson[]>> {
  const found = new Map<string, FirmPerson[]>();
  const all = [...firms];
  for (let at = 0; at < all.length; at += FIRMS_READ_AT_ONCE) {
    const batch = all.slice(at, at + FIRMS_READ_AT_ONCE);
    const read = await Promise.all(
      batch.map(async ([firm, other]): Promise<readonly [string, FirmPerson[]]> => {
        try {
          return [firm, await oneFirmsPeople(userId, firmSpellings(firm, other))] as const;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[research-bridges] a firm’s people not read:', (err as Error).message);
          return [firm, []];
        }
      }),
    );
    for (const [firm, people] of read) if (people.length > 0) found.set(firm, people);
  }
  return found;
}

/**
 * A name in one form whatever alphabet it was written in: the database's own
 * normalization (Georgian to Latin, „kh" to „k"…), then the two sounds it keeps
 * apart that a Latin spelling does not — „ფ" is written p or f, „ძ" dz or z.
 * „ჯაფარიძე" and „Japaridze" both become „japarize".
 */
export function nameKey(text: string): string {
  return normalizeSearchToken(text).replace(/dz/gu, 'z').replace(/f/gu, 'p');
}

/** A person's name as its parts, each at least two letters, each in its one form. */
export function nameParts(name: string): string[] {
  return name
    .split(/\s+/u)
    .map(nameKey)
    .filter((part) => [...part].length >= MIN_NAME_PART_LETTERS);
}

/** Does a saved name hold every part of the person's name — first name and surname both? */
export function savedAsThisPerson(savedAs: string, parts: readonly string[]): boolean {
  const saved = nameKey(savedAs);
  return parts.length >= 2 && parts.every((part) => saved.includes(part));
}

/** A regular expression for a name part against the database's normalized text. */
function nameRegex(part: string): string {
  return part
    .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    .replace(/p/gu, '[pf]')
    .replace(/z/gu, 'd?z');
}

/**
 * For each person's name (a firm's head as the web gives it), the people the
 * owner's contacts saved under that full name — first name and surname both,
 * never a namesake on one word.
 */
export interface HeadThroughAContact extends ThroughAContact {
  /** Someone's label ties this number to the firm; false: the only one by that name, untied. */
  readonly tied_to_the_firm: boolean;
}

/** Everyone the owner's contacts saved under one of the surnames. */
async function heldUnderSurnames(userId: string, surnames: readonly string[]): Promise<HeldRow[]> {
  const own = await phonebookPhones(userId);
  if (own.length === 0 || surnames.length === 0) return [];
  const patterns = surnames.map(nameRegex);
  const aliasOr = patterns
    .map((_, i) => `normalize_search_token(a.alias) ~ $${i + 3}`)
    .join(' OR ');
  const result = await query<HeldRow>(
    `WITH bridges AS (
       SELECT DISTINCT up."userId" AS id, up.phone AS bridge_phone
         FROM "UserPhone" up
        WHERE up.phone = ANY($2) AND up."userId" <> $1::int AND ${notAnExcludedHolder('up."userId"')}
     )
     SELECT DISTINCT ON (a.phone, b.id) a.phone, a.alias AS saved_as, oa.alias AS bridge
       FROM "UserAlias" a
       JOIN bridges b ON b.id = a."contactId"
       JOIN "UserAlias" oa ON oa."contactId" = $1::int AND oa.phone = b.bridge_phone
      WHERE (${aliasOr}) AND NOT (a.phone = ANY($2))
      LIMIT 2000`,
    [userId, own, ...patterns],
    BRIDGE_QUERY_TIMEOUT_MS,
  );
  const blocked = new Set(await getExcludedPhones(userId));
  return result.rows.filter((row) => !blocked.has(row.phone));
}

/**
 * Of the people saved under a head's full name, the one who is the head: tied
 * to the firm by someone's label — or, when nobody is, the only number saved
 * under that name. Several untied numbers are namesakes, and a namesake is not
 * a way in (the tester, 16 Nov).
 */
export function theHead(
  rows: readonly HeldRow[],
  parts: readonly string[],
  tied: ReadonlySet<string>,
): HeadThroughAContact[] {
  const named = rows.filter((row) => savedAsThisPerson(row.saved_as, parts));
  const withTie = named.filter((row) => tied.has(row.phone));
  const phones = new Set(named.map((row) => row.phone));
  const kept = withTie.length > 0 ? withTie : phones.size === 1 ? named : [];
  return kept.slice(0, MAX_PEOPLE_PER_KEY).map((row) => ({
    saved_by_your_contact_as: row.saved_as,
    your_contact: row.bridge,
    tied_to_the_firm: withTie.length > 0,
  }));
}

/**
 * For each head the web names (name → the firm's spellings), the person the
 * owner's contacts saved under that full name — first name and surname both,
 * never a namesake.
 */
export async function namedPeopleThroughContacts(
  userId: string,
  heads: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, HeadThroughAContact[]>> {
  const usable = [...heads]
    .map(([name, firm]) => ({ name, firm, parts: nameParts(name) }))
    .filter((head) => head.parts.length >= 2);
  if (usable.length === 0) return new Map();
  const surnames = [...new Set(usable.map((h) => h.parts[h.parts.length - 1] ?? ''))];
  const rows = await heldUnderSurnames(
    userId,
    surnames.filter((s) => s !== ''),
  );
  if (rows.length === 0) return new Map();
  const found = new Map<string, HeadThroughAContact[]>();
  for (const head of usable) {
    // Only a head someone saved under that name: their firm's labels are read for them alone.
    if (!rows.some((row) => savedAsThisPerson(row.saved_as, head.parts))) continue;
    const tied = new Set((await labelledWith(head.firm)).map((row) => row.phone));
    const people = theHead(rows, head.parts, tied);
    if (people.length > 0) found.set(head.name, people);
  }
  return found;
}
