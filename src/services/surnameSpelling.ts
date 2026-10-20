import { query } from '../db/postgres/client';
import { latinToGeorgian } from './tools/transliterate';

/**
 * G-157 (Giorgi's name rule, 20 Oct): a name is always in Georgian script, its
 * spelling checked against the Georgian names Netai holds — „Turashvili" is
 * ტურაშვილი, not თურაშვილი. First names have their list (georgianFirstNames).
 * Surnames have none, but the base is one: members saved thousands of people
 * in Georgian. So each spelling a Latin surname could have (t is თ or ტ, k is
 * კ or ქ, p is პ or ფ, ts is ც or წ, ch is ჩ or ჭ) is counted among the saved
 * labels, and the one people actually write wins — only when it clearly does.
 * Otherwise nothing is learned and the name stays as registered.
 *
 * The lookup is async and the text builders are not, so callers learn the
 * names they are about to write first (learnSurnameSpellings), and the
 * builders read what was learned (learnedSurnameSpelling).
 */
const LOOKUP_TIMEOUT_MS = 3_000;
const MAX_CANDIDATES = 16;
const COUNT_CAP = 200;
const MIN_USES = 3;
const MIN_LEAD = 2;
const MAX_LEARNED = 5_000;

const TWO_WAY: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['kh', ['ხ']],
  ['sh', ['შ']],
  ['zh', ['ჟ']],
  ['gh', ['ღ']],
  ['dz', ['ძ']],
  ['th', ['თ']],
  ['ph', ['ფ']],
  ['ts', ['ც', 'წ']],
  ['ch', ['ჩ', 'ჭ']],
  ['t', ['თ', 'ტ']],
  ['k', ['კ', 'ქ']],
  ['p', ['პ', 'ფ']],
  ['c', ['ც', 'წ']],
];

const learned = new Map<string, string | null>();

/** Every Georgian spelling the Latin word could have, at most MAX_CANDIDATES. */
export function surnameCandidates(word: string): string[] {
  const lower = word.toLowerCase();
  let spellings = [''];
  let i = 0;
  while (i < lower.length) {
    const match = TWO_WAY.find(([latin]) => lower.startsWith(latin, i));
    const options = match ? match[1] : [latinToGeorgian(lower[i])];
    spellings = spellings.flatMap((s) => options.map((o) => s + o)).slice(0, MAX_CANDIDATES);
    i += match ? match[0].length : 1;
  }
  return spellings;
}

/** The candidate people write, when it leads the next one clearly; null otherwise. */
export function clearWinner(counts: ReadonlyMap<string, number>): string | null {
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (first === undefined || first[1] < MIN_USES) return null;
  return second === undefined || first[1] >= second[1] * MIN_LEAD ? first[0] : null;
}

/**
 * One indexed count per candidate (idx_user_alias_trgm). Each candidate is its
 * own parameter: read from an unnested array the planner cannot use the index,
 * and the lookup ran past its timeout.
 */
async function countsOf(candidates: readonly string[]): Promise<Map<string, number>> {
  const capParam = candidates.length + 1;
  const parts = candidates.map(
    (_c, i) =>
      `SELECT $${i + 1}::text AS candidate, (SELECT COUNT(*)::int FROM (
         SELECT 1 FROM "UserAlias" WHERE lower(alias) LIKE '%' || $${i + 1}::text || '%'
         LIMIT $${capParam}) hits) AS n`,
  );
  const result = await query<{ candidate: string; n: number }>(
    parts.join(' UNION ALL '),
    [...candidates, COUNT_CAP],
    LOOKUP_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.candidate, r.n]));
}

/** Learns the Georgian spelling of each word not learned yet. A failed read learns nothing. */
export async function learnSurnameSpellings(words: readonly string[]): Promise<void> {
  const todo = [...new Set(words.map((w) => w.toLowerCase()))].filter((w) => !learned.has(w));
  for (const word of todo) {
    try {
      const spelling = clearWinner(await countsOf(surnameCandidates(word)));
      if (learned.size >= MAX_LEARNED) learned.clear();
      learned.set(word, spelling);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[surname-spelling] not read:', (err as Error).message);
    }
  }
}

/** What was learned for this word: its Georgian spelling, or null when none is known. */
export function learnedSurnameSpelling(word: string): string | null {
  return learned.get(word.toLowerCase()) ?? null;
}

/** Tests only. */
export function forgetSurnameSpellings(): void {
  learned.clear();
}
