import { query, withTransaction } from '../db/postgres/client';

// PART H phase 3 — the selector and the recording path over migrations
// 061 + 069 (the eight C.9 changes). The bank loads later via
// POST /admin/question-bank; everything here behaves correctly on an empty
// bank (found:false, never a 500).

const PARTH_TIMEOUT_MS = 8_000;
const DIMENSION_MIN = -1;
const DIMENSION_MAX = 1;

export interface NextQuestion {
  question_id: string;
  category: string;
  surface: string;
  prompt: string;
  /** C9.1 — the payoff line, in the user's language, shown WITH the question. */
  immediate_use: string | null;
  options: unknown[];
  select_mode: 'single' | 'multi';
  select_max: number | null;
  goal_bound: boolean;
}

interface BankRow {
  question_id: string;
  category: string;
  surface: string;
  prompt_ka: string;
  prompt_es: string | null;
  prompt_en: string | null;
  options: unknown[];
  score_vector: Record<string, unknown>;
  immediate_use: string;
  immediate_use_ka: string | null;
  immediate_use_es: string | null;
  immediate_use_en: string | null;
  select_mode: 'single' | 'multi';
  select_max: number | null;
  goal_bound: boolean;
}

// The SQL in getNextQuestion already excludes any row missing prompt text in
// the requested language (skip, never fall back to Georgian — the founder's
// ruling), so by the time a row reaches here the requested language's column
// is guaranteed present for es/en, and prompt_ka (required, NOT NULL) always
// is for ka.
function promptFor(row: BankRow, lang: string): string {
  if (lang === 'es' && row.prompt_es) return row.prompt_es;
  if (lang === 'en' && row.prompt_en) return row.prompt_en;
  return row.prompt_ka;
}

// A blank string counts as missing here, the same as null — an admin
// clearing a language column through the PUT editor (task 2, 23 Aug)
// writes '' rather than null (that's the fix: null there means "don't
// touch this field"), and `??` alone does not fall through on ''. Without
// this, a cleared immediate_use_ka rendered as an empty string instead of
// falling back to English/the base column, live-caught on
// col_avoid_intro_704 right after that exact test.
function firstNonBlank(...values: (string | null)[]): string | null {
  for (const v of values) {
    if (v !== null && v.trim() !== '') return v;
  }
  return null;
}

// The real bank (24 Aug load) writes its payoff line into the base
// `immediate_use` column only — immediate_use_ka/es/en are the FUTURE
// per-language columns and are NULL on every row today (English-only by the
// founder's decision). `immediate_use` is therefore the universal fallback,
// last in every chain — without it every language would render nothing.
function immediateUseFor(row: BankRow, lang: string): string | null {
  if (lang === 'es')
    return firstNonBlank(
      row.immediate_use_es,
      row.immediate_use_en,
      row.immediate_use_ka,
      row.immediate_use,
    );
  if (lang === 'en')
    return firstNonBlank(row.immediate_use_en, row.immediate_use_ka, row.immediate_use);
  return firstNonBlank(row.immediate_use_ka, row.immediate_use_en, row.immediate_use);
}

/**
 * The next question for this user (C9.3, C9.5, C9.8 together):
 *  - never one they already hold a current answer to;
 *  - rotation DERIVED from the last non-skipped answer: its category goes to
 *    the back of the queue, so ten questions cover many categories;
 *  - a goal_bound question is asked only with an open goal, its title
 *    prefixed into the prompt — never bare;
 *  - after_rejection questions fire ONLY when that surface is requested.
 */
export async function getNextQuestion(
  userId: string,
  surface: string,
  lang: string,
): Promise<{ found: false } | { found: true; question: NextQuestion }> {
  const lastCategory = await query<{ category: string }>(
    `SELECT qb.category
     FROM answer_events ae JOIN question_bank qb ON qb.question_id = ae.question_id
     WHERE ae.user_id = $1 AND ae.skipped = FALSE AND ae.is_current
     ORDER BY ae.asked_at DESC LIMIT 1`,
    [userId],
    PARTH_TIMEOUT_MS,
  );
  const avoidCategory = lastCategory.rows[0]?.category ?? null;

  const candidates = await query<BankRow>(
    `SELECT qb.question_id, qb.category, qb.surface, qb.prompt_ka, qb.prompt_es, qb.prompt_en,
            qb.options, qb.score_vector, qb.immediate_use, qb.immediate_use_ka,
            qb.immediate_use_es, qb.immediate_use_en, qb.select_mode, qb.select_max, qb.goal_bound
     FROM question_bank qb
     WHERE qb.active
       AND (qb.surface = $2 OR (qb.surface = 'any' AND $2 != 'after_rejection'))
       AND ($2 = 'after_rejection' OR qb.surface != 'after_rejection')
       -- a language with no prompt text for this row is SKIPPED, never
       -- silently rendered in Georgian instead (founder's ruling)
       AND ($4 = 'ka' OR ($4 = 'es' AND qb.prompt_es IS NOT NULL AND trim(qb.prompt_es) != '')
                       OR ($4 = 'en' AND qb.prompt_en IS NOT NULL AND trim(qb.prompt_en) != ''))
       AND NOT EXISTS (
         SELECT 1 FROM answer_events ae
         WHERE ae.user_id = $1 AND ae.question_id = qb.question_id AND ae.is_current
           AND ae.skipped = FALSE
       )
     -- an exact surface match (e.g. weekly_review) must outrank a generic
     -- 'any' row when a specific moment was requested — live-caught: three
     -- different moment values all returned the same 'any' row, because
     -- nothing here previously distinguished surface specificity at all.
     ORDER BY (qb.surface = $2) DESC, (qb.category = $3) ASC, qb.question_id
     LIMIT 5`,
    [userId, surface, avoidCategory, lang],
    PARTH_TIMEOUT_MS,
  );
  if (candidates.rows.length === 0) return { found: false };

  const openGoal = await query<{ title: string }>(
    `SELECT title FROM tasks WHERE user_id = $1 AND status = 'open'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
    PARTH_TIMEOUT_MS,
  );
  const goalTitle = openGoal.rows[0]?.title ?? null;

  // C9.3: a goal_bound question with no open goal is SKIPPED, never bare.
  const pick = candidates.rows.find((r) => !r.goal_bound || goalTitle !== null);
  if (!pick) return { found: false };

  const basePrompt = promptFor(pick, lang);
  return {
    found: true,
    question: {
      question_id: pick.question_id,
      category: pick.category,
      surface: pick.surface,
      prompt: pick.goal_bound && goalTitle ? `[${goalTitle}] — ${basePrompt}` : basePrompt,
      immediate_use: immediateUseFor(pick, lang),
      options: Array.isArray(pick.options) ? pick.options : [],
      select_mode: pick.select_mode,
      select_max: pick.select_max,
      goal_bound: pick.goal_bound,
    },
  };
}

export interface AnswerInput {
  questionId: string;
  optionIds: string[];
  freeText?: string;
  skipped?: boolean;
  surface?: string;
}

export interface AnswerOutcome {
  recorded: boolean;
  error?: string;
  dimensions_moved?: string[];
}

interface ScoreDelta {
  [dimension: string]: number;
}

/**
 * Score deltas for one answering, against the REAL 43-row bank's convention
 * (confirmed against the founder-approved data, 24 Aug — the shape my first
 * version guessed at, per-option deltas, does not match it and would have
 * scored nothing on 41 of 43 questions, silently, forever):
 *
 *   - select_mode='multi' with a `_by_count` sub-object (2 of 43 rows) scores
 *     by HOW MANY options were picked — one pick means clarity, three means
 *     still looking around (C9.2's note).
 *   - every other row's score_vector is a FLAT {dimension: delta} map,
 *     applied ONCE per answered instance, the same regardless of which
 *     option was chosen — the question itself carries the signal, not the
 *     specific answer.
 *
 * An „other" answer, or an answer that is ONLY "other", moves NOTHING
 * (C9.4): research data, not profile data.
 */
function computeDeltas(row: BankRow, optionIds: string[]): ScoreDelta {
  const vector = row.score_vector ?? {};
  const real = optionIds.filter((id) => id !== 'other');
  if (real.length === 0) return {};
  const byCount = vector['_by_count'] as Record<string, ScoreDelta> | undefined;
  if (row.select_mode === 'multi' && byCount) {
    return byCount[String(real.length)] ?? {};
  }
  const flat: ScoreDelta = {};
  for (const [dim, v] of Object.entries(vector)) {
    if (dim !== '_by_count' && typeof v === 'number') flat[dim] = v;
  }
  return flat;
}

export async function recordAnswer(userId: string, input: AnswerInput): Promise<AnswerOutcome> {
  const bank = await query<BankRow>(
    `SELECT question_id, category, surface, prompt_ka, prompt_es, prompt_en, options,
            score_vector, immediate_use, immediate_use_ka, immediate_use_es, immediate_use_en,
            select_mode, select_max, goal_bound
     FROM question_bank WHERE question_id = $1 AND active LIMIT 1`,
    [input.questionId],
    PARTH_TIMEOUT_MS,
  );
  const row = bank.rows[0];
  if (!row) return { recorded: false, error: 'unknown question_id' };

  // C9.2: the cap is enforced server-side — q1 refuses a fourth pick.
  const max = row.select_mode === 'multi' ? (row.select_max ?? 1) : 1;
  if (!input.skipped && input.optionIds.length === 0 && !input.freeText?.trim()) {
    return { recorded: false, error: 'pass option_ids, free_text, or skipped=true' };
  }
  if (input.optionIds.length > max) {
    return { recorded: false, error: `this question accepts at most ${max} option(s)` };
  }

  const deltas = input.skipped ? {} : computeDeltas(row, input.optionIds);

  await withTransaction(async (client) => {
    // The database-enforced supersede rule: flip, then insert, one transaction.
    await client.query(
      `UPDATE answer_events SET is_current = FALSE
       WHERE user_id = $1 AND question_id = $2 AND is_current`,
      [userId, input.questionId],
    );
    await client.query(
      `INSERT INTO answer_events
         (user_id, question_id, option_ids, free_text, raw_answer, surface, answered_at, skipped)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NULL ELSE NOW() END, $7)`,
      [
        userId,
        input.questionId,
        input.optionIds,
        input.freeText?.trim() || null,
        input.optionIds.join(',') || input.freeText?.trim() || null,
        input.surface ?? row.surface,
        input.skipped === true,
      ],
    );
    for (const [dimension, delta] of Object.entries(deltas)) {
      // Postgres can't infer LEAST/GREATEST's argument type from context
      // here (nothing else in the expression ties $3/$4/$5 to a column) and
      // falls back to text, which then fails to assign into the real
      // `value` column ("column is of type real but expression is of type
      // text") — caught live, never by the mocked test suite. Explicit
      // ::real casts remove the ambiguity.
      await client.query(
        `INSERT INTO profile_dimensions (user_id, dimension, value, updated_at)
         VALUES ($1, $2, LEAST($4::real, GREATEST($5::real, $3::real)), NOW())
         ON CONFLICT (user_id, dimension)
         DO UPDATE SET value = LEAST($4::real, GREATEST($5::real, profile_dimensions.value + $3::real)),
                       updated_at = NOW()`,
        [userId, dimension, delta, DIMENSION_MAX, DIMENSION_MIN],
      );
    }
  });

  return { recorded: true, dimensions_moved: Object.keys(deltas) };
}

export async function getDimensions(userId: string): Promise<Record<string, number>> {
  const result = await query<{ dimension: string; value: number }>(
    `SELECT dimension, value FROM profile_dimensions WHERE user_id = $1`,
    [userId],
    PARTH_TIMEOUT_MS,
  );
  const out: Record<string, number> = {};
  for (const r of result.rows) out[r.dimension] = Number(r.value);
  return out;
}

export interface AssumptionRow {
  question_id: string;
  option_ids: string[];
  free_text: string | null;
  answered_at: string | null;
  skipped: boolean;
}

/** What the product currently believes about the user, and where it came from. */
export async function getAssumptions(
  userId: string,
): Promise<{ dimensions: Record<string, number>; answers: AssumptionRow[] }> {
  const [dimensions, answers] = await Promise.all([
    getDimensions(userId),
    query<AssumptionRow>(
      `SELECT question_id, option_ids, free_text, answered_at, skipped
       FROM answer_events WHERE user_id = $1 AND is_current
       ORDER BY asked_at DESC LIMIT 50`,
      [userId],
      PARTH_TIMEOUT_MS,
    ).then((r) => r.rows),
  ]);
  return { dimensions, answers };
}

// C9.7's timer half: a pending introduction older than this produces a
// no_reply outcome row without anyone touching the app.
const NO_REPLY_AFTER_DAYS = 7;

export async function sweepUnansweredIntroOutcomes(): Promise<number> {
  const result = await query(
    `INSERT INTO outcome_events (user_id, subject_type, subject_id, outcome)
     SELECT ir.requester_user_id, 'intro_request', ir.id::text, 'no_reply'
     FROM introduction_requests ir
     WHERE ir.status = 'pending'
       AND ir.created_at < NOW() - INTERVAL '${NO_REPLY_AFTER_DAYS} days'
       AND (ir.snoozed_until IS NULL OR ir.snoozed_until < NOW() - INTERVAL '${NO_REPLY_AFTER_DAYS} days')
     ON CONFLICT (subject_type, subject_id, outcome) DO NOTHING`,
    [],
    PARTH_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

/** declined/accepted land the moment the request resolves (C9.7). */
export async function recordIntroOutcome(
  requesterUserId: number,
  requestId: number,
  outcome: 'declined' | 'accepted',
): Promise<void> {
  await query(
    `INSERT INTO outcome_events (user_id, subject_type, subject_id, outcome)
     VALUES ($1, 'intro_request', $2, $3)
     ON CONFLICT (subject_type, subject_id, outcome) DO NOTHING`,
    [requesterUserId, String(requestId), outcome],
    PARTH_TIMEOUT_MS,
  ).catch(() => undefined);
}
