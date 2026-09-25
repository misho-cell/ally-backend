import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
import { queueResult } from './pendingUpdates.service';

/**
 * SHORT FEEDBACK QUESTIONS AFTER A GOAL IS CLOSED — row 272.
 *
 * The founder's vision document asks for them; the tester confirmed on
 * 25 September that nothing fired on closing a goal and
 * `usage.feedback_answers` reads 0.
 *
 * ⚠️ NOT IN THE QUESTION BANK, and the reason is worth keeping: all 43 rows
 * there carry `options` and a `select_mode`. It is a MULTIPLE-CHOICE bank, and
 * these six are open questions. Putting them there would have meant inventing
 * options nobody asked for.
 *
 * I also nearly marked them `goal_bound`, which reads exactly right and means
 * „asked only while a goal is OPEN". These are asked when one CLOSES. They
 * would have never fired, and the configuration would have looked correct.
 */

/** The founder's six, in his order. Keys, so rewording never orphans an answer. */
export const GOAL_FEEDBACK_QUESTIONS = [
  'what_you_wanted',
  'what_netai_did',
  'what_came_of_it',
  'where_you_stepped_in',
  'again_and_pay',
  'who_would_you_tell',
] as const;

export type GoalFeedbackKey = (typeof GOAL_FEEDBACK_QUESTIONS)[number];

const WORDING: Record<RunLanguage, Record<GoalFeedbackKey, string>> = {
  ka: {
    what_you_wanted: 'რისი გადაჭრა გინდოდა ამ მიზნით?',
    what_netai_did: 'რა გააკეთა Netai-მ?',
    what_came_of_it: 'რა გამოვიდა საბოლოოდ?',
    where_you_stepped_in: 'სად მოგიწია თვითონ ჩარევა?',
    again_and_pay: 'კიდევ გამოიყენებდი და გადაიხდიდი?',
    who_would_you_tell: 'ვის ურჩევდი ამას?',
  },
  en: {
    what_you_wanted: 'What did you want to resolve with this goal?',
    what_netai_did: 'What did Netai do?',
    what_came_of_it: 'What came of it?',
    where_you_stepped_in: 'Where did you have to step in yourself?',
    again_and_pay: 'Would you use it again, and pay for it?',
    who_would_you_tell: 'Whom would you recommend it to?',
  },
  ru: {
    what_you_wanted: 'Что ты хотел решить этой целью?',
    what_netai_did: 'Что сделал Netai?',
    what_came_of_it: 'Чем всё закончилось?',
    where_you_stepped_in: 'Где пришлось вмешаться самому?',
    again_and_pay: 'Воспользовался бы снова и заплатил бы?',
    who_would_you_tell: 'Кому бы ты это посоветовал?',
  },
  es: {
    what_you_wanted: '¿Qué querías resolver con esta meta?',
    what_netai_did: '¿Qué hizo Netai?',
    what_came_of_it: '¿En qué quedó?',
    where_you_stepped_in: '¿Dónde tuviste que intervenir tú?',
    again_and_pay: '¿Lo volverías a usar y pagarías por ello?',
    who_would_you_tell: '¿A quién se lo recomendarías?',
  },
};

const FEEDBACK_TIMEOUT_MS = 4_000;

export function feedbackWording(key: GoalFeedbackKey, language: RunLanguage): string {
  return WORDING[language][key];
}

/**
 * The questions still unanswered for this goal, in the founder's order.
 *
 * Asked one at a time rather than as a form of six: a person who has just
 * finished something will answer one question and close six.
 */
export async function nextFeedbackQuestion(
  taskId: number,
  language: RunLanguage,
): Promise<{ key: GoalFeedbackKey; prompt: string } | null> {
  const answered = await query<{ question_key: string }>(
    `SELECT question_key FROM goal_feedback WHERE task_id = $1`,
    [taskId],
    FEEDBACK_TIMEOUT_MS,
  );
  const done = new Set(answered.rows.map((r) => r.question_key));
  const next = GOAL_FEEDBACK_QUESTIONS.find((k) => !done.has(k));
  return next === undefined ? null : { key: next, prompt: feedbackWording(next, language) };
}

/**
 * Store what they said, verbatim.
 *
 * ⚠️ NOT NORMALISED, NOT SCORED, NOT SUMMARISED. The founder asked what people
 * would say in their own words; a tag vector would answer a question he did
 * not ask, and the words cannot be recovered from it afterwards. `UNIQUE
 * (task_id, question_key)` means answering twice corrects the answer rather
 * than making a second one.
 */
export async function recordGoalFeedback(
  taskId: number,
  userId: string,
  key: GoalFeedbackKey,
  answer: string,
): Promise<'saved' | 'empty'> {
  const text = (answer ?? '').trim();
  if (text === '') return 'empty';
  await query(
    `INSERT INTO goal_feedback (task_id, user_id, question_key, answer)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (task_id, question_key)
     DO UPDATE SET answer = EXCLUDED.answer, answered_at = NOW()`,
    [taskId, userId, key, text.slice(0, 2000)],
    FEEDBACK_TIMEOUT_MS,
  );
  return 'saved';
}

export interface GoalFeedbackRow {
  readonly task_id: number;
  readonly goal: string | null;
  readonly user_id: string;
  readonly person: string | null;
  readonly question_key: string;
  readonly answer: string;
  readonly answered_at: string;
}

/**
 * What the admin reads. Named by PERSON and by the goal's own title, because a
 * page of answers keyed by two integers is a page nobody reads twice.
 */
export async function readGoalFeedback(limit = 200): Promise<GoalFeedbackRow[]> {
  const result = await query<GoalFeedbackRow>(
    `SELECT f.task_id,
            t.title                                   AS goal,
            f.user_id,
            NULLIF(TRIM(u.name), '')                  AS person,
            f.question_key,
            f.answer,
            f.answered_at
       FROM goal_feedback f
       LEFT JOIN tasks t ON t.id = f.task_id
       LEFT JOIN "User" u ON u.id::text = f.user_id
      ORDER BY f.answered_at DESC
      LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
    FEEDBACK_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Put the first question in the update queue when a goal is finished.
 *
 * ⚠️ ONE ITEM, NOT SIX. A person who has just finished something will answer
 * one question and close six. The next one is queued when this one is
 * answered, and if they never answer, the rest are never asked — which is the
 * right outcome and not a gap.
 */
export async function queueGoalFeedback(userId: string, taskId: number): Promise<void> {
  const already = await query<{ id: number }>(
    `SELECT id FROM pending_updates
      WHERE task_id = $1 AND kind = 'goal_feedback' AND status IN ('held', 'released')
      LIMIT 1`,
    [taskId],
    FEEDBACK_TIMEOUT_MS,
  );
  if (already.rows.length > 0) return;
  const next = await nextFeedbackQuestion(taskId, 'ka');
  if (next === null) return;
  await queueResult(userId, taskId, 'goal_feedback', {
    question_key: next.key,
    // ⚠️ THE QUESTION ITSELF, and it was missing. The card that shows this to
    // a person had only the key and the model-facing instruction to work
    // from — so there was nothing to put on the screen even once the renderer
    // existed. The words a person reads must travel with the item.
    prompt: next.prompt,
    // The instruction rides with the item, as every other kind's does — the
    // model reads it in the same breath as the data it applies to.
    instruction:
      `The owner has just finished this goal. Ask them exactly this one question, in their ` +
      `own language, and nothing else: "${next.prompt}". It is feedback on how Netai did, not ` +
      `work on the goal — do not search, do not write to anybody, do not reopen it. When they ` +
      `answer, save it verbatim with save_goal_feedback (task_id, question_key="${next.key}"). ` +
      `If they do not want to answer, let it go and do not ask again.`,
  });
}
