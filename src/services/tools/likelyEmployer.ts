import { query } from '../../db/postgres/client';
import { foldedLower } from './georgianCase';

/**
 * 4657 (box 54353/54354, the prompt chat's test 1): asked where a contact
 * saved „<name> Arci" works, the run said „workplace not in the record" 2 of 3
 * times — the company word sat in the owner's own label and nothing told the
 * model it was a company.
 *
 * The server tells it: a word (or two) in the owner's OWN name or tags for the
 * contact that other people hold as their employer becomes `likely_employer`.
 * Only the owner's own words are read (D539); the employers it is matched
 * against are a count, never anyone's record.
 *
 * MODEL-FACING (D44): LIKELY_EMPLOYER_NOTE is Misho's yes word for word, 12 Oct
 * 11:39 UTC („2 კი", §132). Back to false leaves the profile as it was.
 */
export const LIKELY_EMPLOYER_ON = true;

export const LIKELY_EMPLOYER_NOTE =
  'likely_employer is a word in how the owner saved this contact that other people name as ' +
  'their employer. Say it as likely, going by how the owner saved them — never as certain, and ' +
  'never as a sign the contact uses Netai.';

/** At least this many people must hold the word as their employer. */
const MIN_HOLDERS = 2;
const MIN_WORD_CHARS = 3;
const MAX_LABELS_READ = 30;
const MAX_CANDIDATES = 40;
const QUERY_TIMEOUT_MS = 4_000;
const WORD_SPLIT_RE = /[^\p{L}\p{N}&.-]+/u;
const HAS_LETTER_RE = /\p{L}/u;

export interface LikelyEmployer {
  readonly likely_employer?: string;
  readonly likely_employer_note?: string;
}

/** Words and adjacent pairs of the owner's labels, lowercased, each once; a short word only inside a pair („GD Holding"). */
export function candidateWords(labels: readonly string[]): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    const words = label
      .toLowerCase()
      .split(WORD_SPLIT_RE)
      .filter((w) => HAS_LETTER_RE.test(w));
    words.forEach((w, i) => {
      if (w.length >= MIN_WORD_CHARS) out.add(w);
      if (i + 1 < words.length) out.add(`${w} ${words[i + 1]}`);
    });
  }
  return [...out].slice(0, MAX_CANDIDATES);
}

/** The owner's own saved name and tags for this number — nobody else's. */
async function ownLabels(userId: string, phone: string): Promise<string[]> {
  const result = await query<{ label: string }>(
    `SELECT alias AS label FROM "UserAlias" WHERE "contactId" = $1 AND phone = $2
     UNION
     SELECT tag AS label FROM "UserTags" WHERE "contactId" = $1 AND phone = $2
     LIMIT $3`,
    [userId, phone, MAX_LABELS_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.label);
}

/**
 * #7758 (tester 79008/79009, the founder 30 Oct): an ex-Axel member came back
 * with likely_employer „axel" — a community word in a label, held by a few as
 * an employer. A community is never an employer: a word that is any group's
 * `member_of` name (Axel, CELA, EBAN…) is never offered as one.
 */
/** Of the candidates, the one most people hold as employer, with at least MIN_HOLDERS. */
async function mostHeldEmployer(candidates: readonly string[]): Promise<string | null> {
  const userEmployer = foldedLower('TRIM(employer)');
  const factEmployer = foldedLower('TRIM(value)');
  const result = await query<{ word: string; holders: number }>(
    `SELECT word, COUNT(*)::int AS holders FROM (
       SELECT ${userEmployer} AS word FROM "User"
        WHERE ${userEmployer} = ANY($1::text[]) AND "deletedAt" IS NULL
       UNION ALL
       SELECT ${factEmployer} AS word FROM contact_facts
        WHERE field_type = 'employer' AND retracted_at IS NULL
          AND ${factEmployer} = ANY($1::text[])
     ) held
     WHERE NOT EXISTS (
             SELECT 1 FROM contact_facts m
              WHERE m.field_type = 'member_of' AND ${foldedLower('TRIM(m.value)')} = held.word)
     GROUP BY word HAVING COUNT(*) >= $2
     ORDER BY COUNT(*) DESC, LENGTH(word) DESC
     LIMIT 1`,
    [candidates, MIN_HOLDERS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.word ?? null;
}

/** The word from the owner's own label as they wrote it, not lowercased. */
export function asWritten(labels: readonly string[], word: string): string {
  for (const label of labels) {
    const at = label.toLowerCase().indexOf(word);
    if (at >= 0) return label.slice(at, at + word.length);
  }
  return word;
}

/** The likely employer and its note, or nothing; a failed read gives nothing. */
export async function likelyEmployerFor(
  userId: string,
  phone: string,
  on: boolean = LIKELY_EMPLOYER_ON,
): Promise<LikelyEmployer> {
  if (!on) return {};
  try {
    const labels = await ownLabels(userId, phone);
    const candidates = candidateWords(labels);
    if (candidates.length === 0) return {};
    const word = await mostHeldEmployer(candidates);
    if (word === null) return {};
    return { likely_employer: asWritten(labels, word), likely_employer_note: LIKELY_EMPLOYER_NOTE };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[likely-employer] not read:', (err as Error).message);
    return {};
  }
}

/**
 * 4657 (tester 56332, Misho's yes 13 Oct ~07:20 UTC, §138): the three runs
 * asked „where does X work" through search_contact_by_name alone, so the note
 * that rides with the full profile never reached them, and one answer said
 * the label's company word as certain. The same field and the same note now
 * ride with the name search: on each of the first rows that carries no
 * employer of its own, and the note once for the whole result.
 */
const MAX_ROWS_READ = 3;

interface SearchRow {
  readonly phone?: unknown;
  readonly employer?: unknown;
}

function needsLikelyEmployer(row: SearchRow): row is SearchRow & { phone: string } {
  return typeof row.phone === 'string' && row.phone !== '' && !row.employer;
}

/** The name search's result with each row's likely employer added; unchanged when there is none. */
export async function withLikelyEmployers(
  userId: string,
  found: object,
  on: boolean = LIKELY_EMPLOYER_ON,
): Promise<object> {
  const results = (found as { results?: unknown }).results;
  if (!on || !Array.isArray(results)) return found;
  const rows = results as SearchRow[];
  const read = rows.slice(0, MAX_ROWS_READ);
  const likely: LikelyEmployer[] = await Promise.all(
    read.map((row): Promise<LikelyEmployer> | LikelyEmployer =>
      needsLikelyEmployer(row) ? likelyEmployerFor(userId, row.phone, on) : {},
    ),
  );
  if (likely.every((l) => l.likely_employer === undefined)) return found;
  const withWord = rows.map((row, i) => {
    const word = likely[i]?.likely_employer;
    return word === undefined ? row : { ...row, likely_employer: word };
  });
  return { ...found, results: withWord, likely_employer_note: LIKELY_EMPLOYER_NOTE };
}
