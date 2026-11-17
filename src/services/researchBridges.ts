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

const BRIDGE_QUERY_TIMEOUT_MS = 8_000;
/** Labelled numbers read per search; a firm's name on more than this is not a firm. */
const MAX_LABELLED_PHONES = 2_000;
/** People kept per firm or per name. */
const MAX_PEOPLE_PER_KEY = 5;
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
  return [...new Set([...forms, ...joined])].filter((f) => [...f].length >= 3);
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
  const aliasOr = patterns.map((_, i) => `LOWER(alias) LIKE $${i + 1}`).join(' OR ');
  const tagOr = patterns.map((_, i) => `LOWER(tag) LIKE $${i + 1}`).join(' OR ');
  const result = await query<LabelledRow>(
    `SELECT phone, MIN(label) AS label, COUNT(DISTINCT saver) AS labellers FROM (
       SELECT phone, LOWER(alias) AS label, "contactId" AS saver FROM "UserAlias" WHERE ${aliasOr}
       UNION ALL
       SELECT phone, LOWER(tag) AS label, "contactId" AS saver FROM "UserTags" WHERE ${tagOr}
     ) hits
     GROUP BY phone
     LIMIT ${MAX_LABELLED_PHONES}`,
    patterns,
    BRIDGE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * For each firm, the people the owner's contacts hold whom anyone labelled
 * with the firm's name. One read for all the firms; a firm that fails to read
 * has nobody, never an error.
 */
export async function firmPeopleThroughContacts(
  userId: string,
  firms: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, FirmPerson[]>> {
  const spellingsOf = new Map(
    [...firms].map(([firm, other]) => [firm, firmSpellings(firm, other)] as const),
  );
  const labelled = await labelledWith([...spellingsOf.values()].flat());
  const byPhone = new Map(labelled.map((row) => [row.phone, row]));
  const held = await heldByContacts(userId, [...byPhone.keys()]);
  // The most corroborated first: more people tying them to the firm.
  const labellers = (row: HeldRow): number => Number(byPhone.get(row.phone)?.labellers ?? 0);
  held.sort((a, b) => labellers(b) - labellers(a));
  const found = new Map<string, FirmPerson[]>();
  for (const row of held) {
    const hit = byPhone.get(row.phone);
    if (hit === undefined) continue;
    const label = hit.label.replace(SPACES_RE, '');
    for (const [firm, spellings] of spellingsOf) {
      if (!spellings.some((s) => label.includes(s.replace(SPACES_RE, '')))) continue;
      const people = found.get(firm) ?? [];
      if (people.length >= MAX_PEOPLE_PER_KEY) continue;
      people.push({
        saved_by_your_contact_as: row.saved_as,
        your_contact: row.bridge,
        labelled_with_the_firm_by: Number(hit.labellers),
      });
      found.set(firm, people);
    }
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
  const labelled = await labelledWith([...new Set(usable.flatMap((h) => h.firm))]);
  const found = new Map<string, HeadThroughAContact[]>();
  for (const head of usable) {
    const tied = new Set(
      labelled
        .filter((row) =>
          head.firm.some((s) =>
            row.label.replace(SPACES_RE, '').includes(s.replace(SPACES_RE, '')),
          ),
        )
        .map((row) => row.phone),
    );
    const people = theHead(rows, head.parts, tied);
    if (people.length > 0) found.set(head.name, people);
  }
  return found;
}
