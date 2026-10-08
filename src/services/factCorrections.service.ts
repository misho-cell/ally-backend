import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';
import { retractOwnFacts } from './contactFacts.service';

const CORRECTION_QUERY_TIMEOUT_MS = 8_000;

/**
 * A correction beats the fact it corrects (ticket 9 task 14).
 *
 * The founder's correction lost to the error it corrected because it was
 * stored one state below it: a hidden `note` against a public `occupation`.
 * A correction is not a note and not a competing fact — it is a standing veto
 * over one claim about one person, recorded by the person who made it, and
 * read by the SEARCH LAYER so the wrong answer is never produced.
 */

/** Words too common to carry a claim — a veto on „a"/„is" would silence everything. */
const MIN_WORD_LENGTH = 3;
const VETO_STOPWORDS = new Set([
  'the',
  'and',
  'not',
  'no',
  'longer',
  'active',
  'his',
  'her',
  'their',
  'აღარ',
  'არა',
  'არის',
  'აქტიური',
]);

export function claimWords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-zა-ჿ0-9]+/)
        .filter((w) => w.length >= MIN_WORD_LENGTH && !VETO_STOPWORDS.has(w)),
    ),
  );
}

export interface CorrectionOutcome {
  corrected: boolean;
  retracted: number;
  error?: string;
}

/**
 * „This person is NOT that." Retracts the caller's own rows carrying the wrong
 * claim and records the veto.
 *
 * The crowd's public row is deliberately left alone: another person's
 * phonebook is not this user's to rewrite. What the veto changes is what
 * reaches THIS user — which is exactly what went wrong, since the answer that
 * offended was an answer to him, built from a public value he had already
 * corrected.
 */
export async function correctContactFact(
  userId: string,
  contactPhoneRaw: string,
  wrongValue: string,
  fieldType?: string,
): Promise<CorrectionOutcome> {
  const contactPhone = normalizePhone(contactPhoneRaw);
  const value = wrongValue.trim();
  if (!contactPhone) return { corrected: false, retracted: 0, error: 'Pass the contact phone.' };
  if (!value) {
    return {
      corrected: false,
      retracted: 0,
      error: 'Pass the wrong claim itself, in the words it is stored or asked in.',
    };
  }
  const words = claimWords(value);
  if (words.length === 0) {
    return {
      corrected: false,
      retracted: 0,
      error: 'That correction has no searchable word in it — say what the person is NOT.',
    };
  }

  const { retracted } = await retractOwnFacts(userId, contactPhone, {
    ...(fieldType ? { fieldType } : {}),
    valueFragment: value,
  });

  await query(
    `INSERT INTO fact_corrections (user_id, contact_phone, wrong_value, wrong_words, field_type)
     VALUES ($1::int, $2, $3, $4::text[], $5)
     ON CONFLICT (user_id, contact_phone, wrong_value) DO NOTHING`,
    [userId, contactPhone, value, words, fieldType?.trim().toLowerCase() ?? null],
    CORRECTION_QUERY_TIMEOUT_MS,
  );
  return { corrected: true, retracted };
}

/**
 * 3103 (MASTER TEST RUN SE-029, 2 of 2 seats + F9 SE-031): „ზურა left Colliers"
 * was saved, and „ვის ვიცნობ Colliers-ში?" still listed him; „Levan is no longer
 * an investor", and „ვინ მყავს ინვესტორად შენახული?" listed him first. The words
 * are the same word in another case — „ინვესტორი" / „ინვესტორად", „Colliers" /
 * „Colliers-ში" — so a veto compares word STEMS: one word starts with the
 * other's stem (the word without its last two letters, never under four).
 */
const MIN_STEM_LENGTH = 4;
const STEM_ENDING_LENGTH = 2;
const CORRECTIONS_READ_LIMIT = 500;

function stemOf(word: string): string {
  return word.slice(0, Math.max(MIN_STEM_LENGTH, word.length - STEM_ENDING_LENGTH));
}

export function sameWordStem(a: string, b: string): boolean {
  if (a.length < MIN_STEM_LENGTH || b.length < MIN_STEM_LENGTH) return a === b;
  return a.startsWith(stemOf(b)) || b.startsWith(stemOf(a));
}

export interface MatchingCorrection {
  readonly phone: string;
  readonly wrongValue: string;
}

/**
 * The corrections this user made that share a word stem with these query words —
 * the search layer's own read. Deliberately per-user: a claim is denied for the
 * person who denied it, and everyone else's network is untouched.
 */
export async function correctionsMatching(
  userId: string,
  words: readonly string[],
): Promise<MatchingCorrection[]> {
  const asked = words.map((w) => w.toLowerCase()).filter((w) => w !== '');
  if (asked.length === 0) return [];
  const result = await query<{ contact_phone: string; wrong_value: string; wrong_words: string[] }>(
    `SELECT contact_phone, wrong_value, wrong_words FROM fact_corrections
     WHERE user_id = $1::int ORDER BY created_at DESC LIMIT $2`,
    [userId, CORRECTIONS_READ_LIMIT],
    CORRECTION_QUERY_TIMEOUT_MS,
  );
  return result.rows
    .filter((row) =>
      (row.wrong_words ?? []).some((wrong) => asked.some((word) => sameWordStem(word, wrong))),
    )
    .map((row) => ({ phone: normalizePhone(row.contact_phone), wrongValue: row.wrong_value }));
}

/** The phones this user has vetoed for these query words. */
export async function vetoedPhonesFor(userId: string, words: string[]): Promise<Set<string>> {
  return new Set((await correctionsMatching(userId, words)).map((c) => c.phone));
}

/** Everything this user has corrected, for the record and for an admin read. */
export async function listCorrections(
  userId: string,
  limit = 100,
): Promise<{ contact_phone: string; wrong_value: string; created_at: string }[]> {
  const result = await query<{ contact_phone: string; wrong_value: string; created_at: string }>(
    `SELECT contact_phone, wrong_value, created_at FROM fact_corrections
     WHERE user_id = $1::int ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
    CORRECTION_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
