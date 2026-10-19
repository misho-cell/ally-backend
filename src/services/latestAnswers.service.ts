import { query } from '../db/postgres/client';
import { AskState, ownerAskLine } from './askState';
import type { RunLanguage } from './runLanguage';

/**
 * #6344 (Giorgi, G-089, goal 29308): Lika's „I know him and will connect you"
 * reached Giorgi in his conversation and never appeared in „ბოლო სიახლეები".
 * The home card read only pending_updates, and an answer that arrives while
 * the owner can be told at once is delivered straight into the conversation —
 * no update row is ever written for it. So the card also reads the answers
 * themselves: every answer to the owner's own question in the last two weeks,
 * said with the line the goal already uses for it („<name>: უპასუხა").
 */
const ANSWERS_WINDOW_DAYS = 14;
const QUERY_TIMEOUT_MS = 5_000;
const ANSWER_REF_PREFIX = 'ask_';
export const ANSWER_KIND = 'answer';

export interface LatestAnswer {
  readonly ask_id: number;
  readonly task_id: number;
  readonly thread_id: number | null;
  readonly case_title: string | null;
  readonly to_name: string;
  readonly declined: boolean;
  readonly answered_at: Date;
}

export async function latestAnswers(userId: string, limit: number): Promise<LatestAnswer[]> {
  const result = await query<LatestAnswer>(
    `SELECT a.id AS ask_id, a.task_id, t.thread_id, th.short_title AS case_title,
            u.name AS to_name, (a.declined_at IS NOT NULL) AS declined,
            a.answered_at
       FROM task_asks a
       JOIN tasks t ON t.id = a.task_id AND t.user_id = a.from_user_id
       LEFT JOIN threads th ON th.id = t.thread_id
       LEFT JOIN "User" u ON u.id = a.to_user_id
      WHERE a.from_user_id = $1::int
        AND a.status = 'answered'
        AND u.name IS NOT NULL
        AND a.answered_at > NOW() - make_interval(days => $2)
      ORDER BY a.answered_at DESC
      LIMIT $3`,
    [userId, ANSWERS_WINDOW_DAYS, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The answer's one line, in the goal's own words for it. */
export function answerLine(answer: LatestAnswer, language: RunLanguage): string {
  const state = answer.declined ? AskState.Declined : AskState.Answered;
  return ownerAskLine(answer.to_name.trim(), { status: 'answered' }, state, language);
}

export function answerRef(askId: number): string {
  return `${ANSWER_REF_PREFIX}${String(askId)}`;
}
