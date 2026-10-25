import { query } from '../../db/postgres/client';
import { mostCommonFullForm } from '../fullNameFromLabels';
import { nameKey } from '../tools/transliterate';
import { FactConfidence, StoredFact } from './plan';

/**
 * #7726 (tester's engagement desk C-0020, 25 Oct): registration research
 * attached namesakes — a US professor, the Wikipedia page for „Giorgi", a TV
 * presenter. What other members saved about the person tells them apart:
 *
 *   - the name searched is the fullest one they saved (#7728) when the
 *     registered name is a single word; a name still one word is not searched;
 *   - the other words of their labels („TBC", „UGT", „Axel") are the person's
 *     identity, and a fact that holds none of them is kept only as possible.
 */
const QUERY_TIMEOUT_MS = 4_000;
const MAX_LABELS_READ = 200;
const MIN_IDENTITY_WORD_CHARS = 3;
const MIN_SEARCHED_NAME_WORDS = 2;

export interface ResearchIdentity {
  /** The name to search, or null when it is a single word: no public search then. */
  readonly searchName: string | null;
  /** Words from others' labels beyond the name, normalised; empty when none. */
  readonly words: readonly string[];
}

async function labelsOthersSaved(userId: number): Promise<string[]> {
  const result = await query<{ alias: string }>(
    `SELECT TRIM(ua.alias) AS alias
       FROM "UserAlias" ua
       JOIN "UserPhone" up ON up.phone = ua.phone
      WHERE up."userId" = $1 AND ua."contactId" <> $1 AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
      LIMIT $2`,
    [userId, MAX_LABELS_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.alias);
}

/** The words of the labels that are not the person's name: their workplace, role, group. */
export function identityWords(labels: readonly string[], name: string): string[] {
  const nameWords = new Set(nameKey(name).split(' '));
  const words = labels.flatMap((label) => nameKey(label).split(' '));
  return [
    ...new Set(words.filter((w) => w.length >= MIN_IDENTITY_WORD_CHARS && !nameWords.has(w))),
  ];
}

export function researchIdentity(labels: readonly string[], registered: string): ResearchIdentity {
  const name = registered.trim();
  const fuller =
    name.split(/\s+/u).length < MIN_SEARCHED_NAME_WORDS ? mostCommonFullForm(labels, name) : null;
  // A third word in a label is usually where they work („… UGT"): it is identity, not name.
  const searchName =
    fuller === null ? name : fuller.split(/\s+/u).slice(0, MIN_SEARCHED_NAME_WORDS).join(' ');
  return {
    searchName: searchName.split(/\s+/u).length >= MIN_SEARCHED_NAME_WORDS ? searchName : null,
    words: identityWords(labels, searchName),
  };
}

export async function identityFor(userId: number, registered: string): Promise<ResearchIdentity> {
  return researchIdentity(await labelsOthersSaved(userId), registered);
}

/** A fact that holds none of the identity words is possible, however many sites carry it. */
export function checkedAgainst(
  facts: readonly StoredFact[],
  words: readonly string[],
): StoredFact[] {
  if (words.length === 0) return [...facts];
  return facts.map((fact) => {
    const value = nameKey(fact.value).split(' ');
    return words.some((w) => value.includes(w))
      ? fact
      : { ...fact, confidence: FactConfidence.Possible };
  });
}
