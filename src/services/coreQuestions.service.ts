import { query } from '../db/postgres/client';

/**
 * The frontend's 14 Oct 14:10Z item 4 (task 1917, phone 54): the profile page
 * shows the core questions together — which are answered and with what — and
 * answers one through the existing POST /profile/feedback
 * ({ question_id, free_text }). There are five core questions (migration 216),
 * not seven; the page draws what this list gives.
 */
const QUERY_TIMEOUT_MS = 5_000;
const CORE_CATEGORY = 'core';
const MAX_CORE_QUESTIONS = 20;

export enum QuestionLanguage {
  Ka = 'ka',
  En = 'en',
  Es = 'es',
}

export interface CoreQuestion {
  readonly question_id: string;
  readonly text: string;
  /** Why Netai asks, in the same language. */
  readonly reason: string | null;
  readonly answered: boolean;
  /** The person's own current answer, when they typed one. */
  readonly answer: string | null;
}

export function questionLanguage(raw: unknown): QuestionLanguage {
  return Object.values(QuestionLanguage).includes(raw as QuestionLanguage)
    ? (raw as QuestionLanguage)
    : QuestionLanguage.Ka;
}

interface Row {
  readonly question_id: string;
  readonly prompt_ka: string;
  readonly prompt_en: string | null;
  readonly prompt_es: string | null;
  readonly immediate_use_ka: string | null;
  readonly immediate_use_en: string | null;
  readonly immediate_use_es: string | null;
  readonly answer: string | null;
  readonly answered: boolean;
}

function inLanguage(
  ka: string | null,
  en: string | null,
  es: string | null,
  lang: QuestionLanguage,
): string | null {
  if (lang === QuestionLanguage.Es && es?.trim()) return es;
  if (lang !== QuestionLanguage.Ka && en?.trim()) return en;
  return ka;
}

export async function coreQuestions(
  userId: number,
  lang: QuestionLanguage,
): Promise<CoreQuestion[]> {
  const result = await query<Row>(
    `SELECT qb.question_id, qb.prompt_ka, qb.prompt_en, qb.prompt_es,
            qb.immediate_use_ka, qb.immediate_use_en, qb.immediate_use_es,
            ae.free_text AS answer, (ae.id IS NOT NULL) AS answered
       FROM question_bank qb
       LEFT JOIN LATERAL (
         SELECT a.id, a.free_text FROM answer_events a
          WHERE a.user_id = $1 AND a.question_id = qb.question_id
            AND a.is_current AND a.skipped = FALSE
          ORDER BY a.answered_at DESC NULLS LAST LIMIT 1
       ) ae ON TRUE
      WHERE qb.active AND qb.category = $2
      ORDER BY qb.question_id
      LIMIT $3`,
    [userId, CORE_CATEGORY, MAX_CORE_QUESTIONS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    question_id: r.question_id,
    text: inLanguage(r.prompt_ka, r.prompt_en, r.prompt_es, lang) ?? r.prompt_ka,
    reason: inLanguage(r.immediate_use_ka, r.immediate_use_en, r.immediate_use_es, lang),
    answered: r.answered,
    answer: r.answer,
  }));
}
