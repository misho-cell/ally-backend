import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';
import { getUserProfile } from './userProfile.service';

/**
 * #1354 (Giorgi, 5 Oct): a member asked Netai about himself and was told
 * „I have no public information about you" and „your number is not visible",
 * while two other people asking about him in the same minutes were told his
 * profession. Every search drops the owner's own phones, and nothing read the
 * facts others see about him. This is his own view of all of it.
 *
 * What others see is the PUBLIC facts saved under his number (crowd-confirmed
 * or approved). Who saved them is never said (the spirit of D523), and facts
 * that are not public stay out — they are shown to nobody, him included.
 */
const ABOUT_ME_TIMEOUT_MS = 5_000;
const MAX_OWN_NUMBERS = 5;
const MAX_PUBLIC_FACTS = 40;
const MAX_OWN_ANSWERS = 20;

export interface PublicFact {
  readonly field_type: string;
  readonly value: string;
}

/** One answer the owner gave to Netai's profile questions (2740). */
export interface OwnAnswer {
  readonly question_ka: string;
  readonly question_en: string | null;
  readonly answer_ka: string;
  readonly answer_en: string | null;
}

export interface AboutMe {
  readonly name: string | null;
  readonly own_numbers: readonly string[];
  readonly my_profile: Readonly<Record<string, string>>;
  readonly what_others_see: readonly PublicFact[];
  readonly my_answers: readonly OwnAnswer[];
}

async function ownName(userId: string): Promise<string | null> {
  const result = await query<{ name: string | null }>(
    'SELECT name FROM "User" WHERE id = $1 LIMIT 1',
    [userId],
    ABOUT_ME_TIMEOUT_MS,
  );
  return result.rows[0]?.name?.trim() || null;
}

async function ownNumbers(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 ORDER BY phone LIMIT $2',
    [userId, MAX_OWN_NUMBERS],
    ABOUT_ME_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.phone);
}

async function publicFactsAbout(numbers: readonly string[]): Promise<PublicFact[]> {
  const ids = [...new Set(numbers.map((n) => normalizePhone(n)).filter((n) => n !== ''))];
  if (ids.length === 0) return [];
  const result = await query<PublicFact>(
    `SELECT DISTINCT field_type, COALESCE(canonical_value, value) AS value
       FROM contact_facts
      WHERE neo4j_contact_id = ANY($1::text[]) AND is_public = true AND retracted_at IS NULL
      ORDER BY field_type, value
      LIMIT $2`,
    [ids, MAX_PUBLIC_FACTS],
    ABOUT_ME_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * 2740: the owner's answers to Netai's profile questions (answer_profile_question)
 * are part of what Netai knows about them, so „რა იცი ჩემზე?" says them back.
 * Current, answered (not skipped) ones only; the chosen options in both
 * languages, or what the owner typed.
 */
async function ownAnswers(userId: string): Promise<OwnAnswer[]> {
  const result = await query<{
    question_ka: string;
    question_en: string | null;
    picked_ka: string | null;
    picked_en: string | null;
    free_text: string | null;
  }>(
    `SELECT qb.prompt_ka AS question_ka, qb.prompt_en AS question_en,
            (SELECT string_agg(o->>'ka', ', ') FROM jsonb_array_elements(qb.options) o
              WHERE o->>'id' = ANY(ae.option_ids)) AS picked_ka,
            (SELECT string_agg(o->>'en', ', ') FROM jsonb_array_elements(qb.options) o
              WHERE o->>'id' = ANY(ae.option_ids)) AS picked_en,
            NULLIF(TRIM(ae.free_text), '') AS free_text
       FROM answer_events ae JOIN question_bank qb ON qb.question_id = ae.question_id
      WHERE ae.user_id = $1 AND ae.is_current AND NOT ae.skipped AND ae.answered_at IS NOT NULL
      ORDER BY ae.answered_at DESC
      LIMIT $2`,
    [userId, MAX_OWN_ANSWERS],
    ABOUT_ME_TIMEOUT_MS,
  );
  return result.rows.flatMap((row) => {
    const answerKa = [row.picked_ka, row.free_text].filter(Boolean).join('; ');
    if (answerKa === '') return [];
    const answerEn = [row.picked_en, row.free_text].filter(Boolean).join('; ');
    return [
      {
        question_ka: row.question_ka,
        question_en: row.question_en,
        answer_ka: answerKa,
        answer_en: answerEn === '' ? null : answerEn,
      },
    ];
  });
}

export async function whatNetaiKnowsAboutMe(userId: string): Promise<AboutMe> {
  const [name, numbers, profile, answers] = await Promise.all([
    ownName(userId),
    ownNumbers(userId),
    getUserProfile(userId),
    ownAnswers(userId),
  ]);
  return {
    name,
    own_numbers: numbers,
    my_profile: profile,
    what_others_see: await publicFactsAbout(numbers),
    my_answers: answers,
  };
}
