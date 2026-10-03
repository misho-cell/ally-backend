/**
 * Board #510, the tester's 1086 (3 Oct): handing the model the profession's
 * other words (`also_search`) was not enough. Two runs of „who is a programmer
 * among my contacts?" on a seat with a contact tagged „CTO" each searched five
 * of the eleven words, never „CTO", and answered „no programmer".
 *
 * So the server searches the family itself, in the same tool call, and the
 * model receives one result that already holds everybody. Only exact matches
 * of the other words are taken: a fuzzy pass over a two-letter word like „IT"
 * would bring in strangers, and the primary word keeps its own fuzzy pass.
 */
const MAX_FAMILY_WORDS = 12;

type Row = Readonly<Record<string, unknown>>;

export interface FamilyHit {
  readonly word: string;
  readonly result: unknown;
}

function rowsOf(result: unknown): readonly Row[] {
  if (typeof result !== 'object' || result === null) return [];
  const rows = (result as { results?: unknown }).results;
  return Array.isArray(rows)
    ? rows.filter((r): r is Row => typeof r === 'object' && r !== null)
    : [];
}

function keyOf(row: Row): string {
  const phone = row['phone'];
  if (typeof phone === 'string' && phone !== '') return `p:${phone.replace(/\D/g, '')}`;
  return `n:${String(row['name'] ?? row['saved_as'] ?? '')}`;
}

/** The family's other words, capped, so one search can never fan out without bound. */
export function familyWordsToSearch(related: readonly string[]): readonly string[] {
  return related.slice(0, MAX_FAMILY_WORDS);
}

/** The primary result with every exact hit of the family's other words added once. */
export function mergeFamilyResults(primary: unknown, hits: readonly FamilyHit[]): object {
  const base: Record<string, unknown> =
    typeof primary === 'object' && primary !== null ? { ...(primary as object) } : {};
  const rows: Row[] = [...rowsOf(primary)];
  const seen = new Set(rows.map(keyOf));
  for (const hit of hits) {
    for (const row of rowsOf(hit.result)) {
      if (row['approximate'] === true || seen.has(keyOf(row))) continue;
      seen.add(keyOf(row));
      rows.push({ ...row, matched_word: hit.word });
    }
  }
  return {
    ...base,
    found: rows.length > 0,
    count: rows.length,
    results: rows,
    also_searched: hits.map((h) => h.word),
  };
}

/** Searches each other word of the family and merges; a failed word is skipped, never fatal. */
export async function searchProfessionFamily(
  primary: unknown,
  related: readonly string[],
  search: (word: string) => Promise<unknown>,
): Promise<object> {
  const words = familyWordsToSearch(related);
  const settled = await Promise.allSettled(words.map((word) => search(word)));
  const hits: FamilyHit[] = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') hits.push({ word: words[i], result: s.value });
    else
      // eslint-disable-next-line no-console
      console.warn(`[tag-family] „${words[i]}" not searched:`, (s.reason as Error).message);
  });
  return mergeFamilyResults(primary, hits);
}
