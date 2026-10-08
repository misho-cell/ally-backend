import { query } from '../db/postgres/client';
import { queryTerms } from './askBoundary.service';
import { phoneDigits } from './phone';

/**
 * 1694 (A11, the intelligence research of 6 October, D679/D680): the asker's
 * side chose whom to ask from what IT could see, and the recipient's own data —
 * his notes, his profile, his boundaries — was never consulted before he was
 * bothered. Before a wave is assembled, the server now reads, for each
 * candidate, only that candidate's own data and gives ONE word:
 *
 *   not_his_field — his own boundary covers the field;
 *   likely_yes    — his own profile or profile note says he works in it;
 *   possibly      — only a label somebody saved for him matches;
 *   ask_him       — nothing is known.
 *
 * Rules, no model call (the small engine is a later task). What leaves his
 * context is the word alone: it orders the waves and is stored on the ask for
 * the admin. The asker's goal and messages never carry it, and a person the
 * owner named himself is never held back by it (D625 — the wave gate's own).
 */
export enum PrematchWord {
  LikelyYes = 'likely_yes',
  Possibly = 'possibly',
  NotHisField = 'not_his_field',
  AskHim = 'ask_him',
}

export enum PrematchSource {
  Boundary = 'boundary',
  OwnProfile = 'own_profile',
  OwnNote = 'own_note',
  Label = 'label',
  NothingKnown = 'nothing_known',
  NotAMember = 'not_a_member',
}

export interface Prematch {
  readonly word: PrematchWord;
  readonly source: PrematchSource;
}

const QUERY_TIMEOUT_MS = 5_000;
const ROWS_READ = 2_000;
/** A term this short is a particle, not a field. */
const MIN_TERM_CHARS = 3;

/** Words of a goal that name no field: the need itself, not what is needed. */
const NOT_A_FIELD: ReadonlySet<string> = new Set(
  [
    'მჭირდება',
    'საჭიროა',
    'ვეძებ',
    'ვეძებთ',
    'კარგი',
    'ვინმე',
    'ვინმეს',
    'მინდა',
    'იცნობ',
    'იცნობს',
    'დამეხმარე',
    'need',
    'needs',
    'looking',
    'good',
    'someone',
    'anyone',
    'find',
    'help',
    'want',
    'for',
    'the',
    'and',
    'with',
    'from',
    'who',
    'that',
    'this',
    'can',
    'you',
    'your',
    'has',
    'have',
    'ჩემი',
    'ჩემს',
    'ერთი',
    'ვინც',
    'რომელიც',
    'ასევე',
    'ძალიან',
  ].flatMap((w) => queryTerms(w)),
);

/** The goal's field, as comparable terms. */
export function fieldTerms(goalText: string): string[] {
  return queryTerms(goalText).filter((t) => t.length >= MIN_TERM_CHARS && !NOT_A_FIELD.has(t));
}

function termsMeet(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** Does this text speak of the field? Word by word, prefix either way. */
export function textSpeaksOf(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0 || text.trim() === '') return false;
  const own = queryTerms(text);
  return own.some((w) => terms.some((t) => termsMeet(w, t)));
}

/** What is known about one candidate, read only from his own context. */
export interface CandidateEvidence {
  readonly member: boolean;
  readonly boundaryTerms: readonly string[];
  readonly profileTexts: readonly string[];
  readonly noteTexts: readonly string[];
  readonly labels: readonly string[];
}

/** The rules, in order: his boundary, his own word about himself, a label, nothing. */
export function classify(evidence: CandidateEvidence, terms: readonly string[]): Prematch {
  if (!evidence.member) return { word: PrematchWord.AskHim, source: PrematchSource.NotAMember };
  if (evidence.boundaryTerms.some((b) => terms.some((t) => termsMeet(b, t)))) {
    return { word: PrematchWord.NotHisField, source: PrematchSource.Boundary };
  }
  if (evidence.profileTexts.some((text) => textSpeaksOf(text, terms))) {
    return { word: PrematchWord.LikelyYes, source: PrematchSource.OwnProfile };
  }
  if (evidence.noteTexts.some((text) => textSpeaksOf(text, terms))) {
    return { word: PrematchWord.LikelyYes, source: PrematchSource.OwnNote };
  }
  if (evidence.labels.some((label) => textSpeaksOf(label, terms))) {
    return { word: PrematchWord.Possibly, source: PrematchSource.Label };
  }
  return { word: PrematchWord.AskHim, source: PrematchSource.NothingKnown };
}

const RANK: Readonly<Record<PrematchWord, number>> = {
  [PrematchWord.LikelyYes]: 0,
  [PrematchWord.Possibly]: 1,
  [PrematchWord.AskHim]: 2,
  [PrematchWord.NotHisField]: 3,
};

/** The candidates in the words' order; the plan's order within one word. */
export function rankByPrematch<T extends { readonly phone: string }>(
  people: readonly T[],
  words: ReadonlyMap<string, Prematch>,
): T[] {
  const rankOf = (p: T): number =>
    RANK[words.get(phoneDigits(p.phone))?.word ?? PrematchWord.AskHim];
  return people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => rankOf(a.person) - rankOf(b.person) || a.index - b.index)
    .map(({ person }) => person);
}

interface Members {
  readonly byDigits: ReadonlyMap<string, string>;
}

/** The stored forms of a number: E.164 with „+", and bare digits. Matched by index, never by a scan. */
function storedForms(digits: readonly string[]): string[] {
  return [...new Set(digits.flatMap((d) => [`+${d}`, d]))];
}

async function membersOf(digits: readonly string[]): Promise<Members> {
  const result = await query<{ phone: string; user_id: string }>(
    `SELECT phone, "userId"::text AS user_id FROM "UserPhone"
      WHERE phone = ANY($1::text[])
      LIMIT $2`,
    [storedForms(digits), ROWS_READ],
    QUERY_TIMEOUT_MS,
  );
  return { byDigits: new Map(result.rows.map((r) => [phoneDigits(r.phone), r.user_id])) };
}

function groupBy(rows: readonly { key: string; text: string | null }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    if (row.text === null || row.text.trim() === '') continue;
    out.set(row.key, [...(out.get(row.key) ?? []), row.text]);
  }
  return out;
}

/** Each member's own boundaries, profile, profile notes; everyone's labels on each number. */
async function evidenceFor(
  userIds: readonly string[],
  digits: readonly string[],
): Promise<{
  boundaries: Map<string, string[]>;
  profiles: Map<string, string[]>;
  notes: Map<string, string[]>;
  labels: Map<string, string[]>;
}> {
  const [boundaries, kv, users, notes, labels] = await Promise.all([
    query<{ key: string; text: string | null }>(
      `SELECT user_id::text AS key, term AS text FROM ask_boundaries
        WHERE user_id = ANY($1::int[]) LIMIT $2`,
      [userIds, ROWS_READ],
      QUERY_TIMEOUT_MS,
    ),
    query<{ key: string; text: string | null }>(
      `SELECT user_id AS key, value AS text FROM user_profile_kv
        WHERE user_id = ANY($1::text[]) LIMIT $2`,
      [userIds, ROWS_READ],
      QUERY_TIMEOUT_MS,
    ),
    query<{ key: string; text: string | null }>(
      `SELECT id::text AS key,
              CONCAT_WS(' ', "jobPosition", employer) AS text
         FROM "User" WHERE id = ANY($1::int[]) LIMIT $2`,
      [userIds, ROWS_READ],
      QUERY_TIMEOUT_MS,
    ),
    query<{ key: string; text: string | null }>(
      `SELECT user_id AS key, text FROM user_notes
        WHERE user_id = ANY($1::text[]) AND kind = 'profile' LIMIT $2`,
      [userIds, ROWS_READ],
      QUERY_TIMEOUT_MS,
    ),
    query<{ key: string; text: string | null }>(
      `SELECT phone AS key, tag AS text FROM "UserTags"
        WHERE phone = ANY($1::text[]) LIMIT $2`,
      [storedForms(digits), ROWS_READ],
      QUERY_TIMEOUT_MS,
    ),
  ]);
  const profiles = groupBy([...kv.rows, ...users.rows]);
  return {
    boundaries: groupBy(boundaries.rows),
    profiles,
    notes: groupBy(notes.rows),
    labels: groupBy(labels.rows.map((r) => ({ key: phoneDigits(r.key), text: r.text }))),
  };
}

/** One word per candidate number (keyed by digits), read from each candidate's own data. */
export async function prematchMany(
  phones: readonly string[],
  goalText: string,
): Promise<Map<string, Prematch>> {
  const digits = [...new Set(phones.map(phoneDigits).filter((d) => d !== ''))];
  const out = new Map<string, Prematch>();
  if (digits.length === 0) return out;
  const terms = fieldTerms(goalText);
  const members = await membersOf(digits);
  const userIds = [...new Set(members.byDigits.values())];
  const known = await evidenceFor(userIds, digits);
  for (const d of digits) {
    const userId = members.byDigits.get(d);
    out.set(
      d,
      classify(
        {
          member: userId !== undefined,
          boundaryTerms: userId === undefined ? [] : (known.boundaries.get(userId) ?? []),
          profileTexts: userId === undefined ? [] : (known.profiles.get(userId) ?? []),
          noteTexts: userId === undefined ? [] : (known.notes.get(userId) ?? []),
          labels: known.labels.get(d) ?? [],
        },
        terms,
      ),
    );
  }
  return out;
}
