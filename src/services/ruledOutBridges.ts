import { query } from '../db/postgres/client';
import { queryTerms } from './askBoundary.service';
import { phoneDigits } from './phone';

/**
 * #6358: a person the owner rules out stays out of later searches on the same
 * subject — saved by the model with exclude_contact, and left out here the way
 * a person's own boundary is left out.
 *
 * #8779 b (rule 35, the founder 4 Nov 19:07): the server no longer reads refusal
 * or „never" words in the owner's line to save an exclusion itself.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_EXCLUSIONS_READ = 200;

/**
 * Whether an exclusion's scope is about this subject: its words in the
 * subject, stem either way — two of them when it has two or more, so a word
 * every goal shares („help", „find", „introduction") is never enough alone.
 */
const SHARED_WORDS_NEEDED = 2;

/**
 * The tester's 69082 (#6358, 3 of 3): „never involve Gia in my matters" was
 * kept as „ყველა საქმე" / „ნებისმიერი საქმე" (all / any matter), which shares
 * no word with „a notary for inheritance papers", so the next chat asked Gia.
 * A scope that is only „every" plus a word for „matter" is every subject.
 */
const EVERY_WORDS: readonly string[] = [
  'ყველა',
  'ნებისმიერ',
  'ყველაფერ',
  'all',
  'any',
  'every',
  'everything',
  'все',
  'всё',
  'любо',
  'todo',
  'toda',
  'cualquier',
];
const MATTER_WORDS: readonly string[] = [
  'საქმ',
  'საკითხ',
  'რამ',
  'matter',
  'thing',
  'issue',
  'case',
  'affair',
  'дел',
  'вопрос',
  'asunto',
  'cosa',
  'tema',
];
/** Whole words that carry no subject: „all MY matters" is still every matter. */
const FILLER_WORDS: ReadonlySet<string> = new Set([
  'ჩემი',
  'ჩემს',
  'ჩემ',
  'ჩემთვის',
  'my',
  'mine',
  'of',
  'in',
  'for',
  'the',
  'мои',
  'моих',
  'в',
  'mis',
  'en',
  'de',
]);
const SCOPE_WORD_RE = /[\p{L}\p{M}]+/gu;

function startsWithAny(word: string, stems: readonly string[]): boolean {
  return stems.some((stem) => word.startsWith(stem));
}

export function scopeIsEverything(scope: string): boolean {
  const words = scope.toLowerCase().match(SCOPE_WORD_RE) ?? [];
  return (
    words.some((w) => startsWithAny(w, EVERY_WORDS)) &&
    words.every(
      (w) => FILLER_WORDS.has(w) || startsWithAny(w, EVERY_WORDS) || startsWithAny(w, MATTER_WORDS),
    )
  );
}

export function scopeCovers(scope: string, subjectTerms: readonly string[]): boolean {
  if (scopeIsEverything(scope)) return true;
  const scopeTerms = queryTerms(scope);
  const shared = scopeTerms.filter((s) =>
    subjectTerms.some((t) => s === t || s.startsWith(t) || t.startsWith(s)),
  ).length;
  return shared > 0 && shared >= Math.min(SHARED_WORDS_NEEDED, scopeTerms.length);
}

/** The phones this owner ruled out for anything this subject is about. */
export async function ruledOutOnSubject(userId: string, subject: string): Promise<string[]> {
  const terms = queryTerms(subject);
  if (terms.length === 0) return [];
  const result = await query<{ contact_phone: string; excluded_for: string }>(
    `SELECT contact_phone, excluded_for FROM contact_exclusions
      WHERE user_id = $1::int
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, MAX_EXCLUSIONS_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows
    .filter((row) => scopeCovers(row.excluded_for, terms))
    .map((row) => phoneDigits(row.contact_phone));
}
