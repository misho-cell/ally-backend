import { query } from '../db/postgres/client';
import { AskState, ownerAskLine } from './askState';
import { introOutcomeLine } from './introOpening';
import { stripAllowedSpans } from './privacyScrub';
import type { RunLanguage } from './runLanguage';
import { nameAsSavedBySql } from './savedNameSql';
import { nameToSay } from './spokenName';

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
/** The longest answer the card carries; „მეტი" opens the case for the rest. */
export const ANSWER_GIST_MAX_CHARS = 280;
const ELLIPSIS = '…';
const WHITESPACE_RE = /\s+/gu;
export const ANSWER_KIND = 'answer';

export interface LatestAnswer {
  readonly ask_id: number;
  readonly task_id: number;
  readonly thread_id: number | null;
  readonly case_title: string | null;
  readonly to_name: string;
  readonly declined: boolean;
  /** What the person answered, as the goal stored it; null when nothing was stored. */
  readonly answer: string | null;
  readonly answered_at: Date;
}

export async function latestAnswers(userId: string, limit: number): Promise<LatestAnswer[]> {
  const result = await query<LatestAnswer>(
    `SELECT a.id AS ask_id, a.task_id, t.thread_id, th.short_title AS case_title,
            u.name AS to_name, (a.declined_at IS NOT NULL) AS declined,
            a.answer, a.answered_at
       FROM task_asks a
       JOIN tasks t ON t.id = a.task_id AND t.user_id = a.from_user_id::text
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

/** The stored answer as one line: markers off, spaces folded, cut on a word at the cap. */
export function answerGist(answer: string | null): string {
  const flat = stripAllowedSpans(answer ?? '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
  if (flat.length <= ANSWER_GIST_MAX_CHARS) return flat;
  const cut = flat.slice(0, ANSWER_GIST_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ELLIPSIS}`;
}

/**
 * The answer's one line. #6768 (Giorgi, 20 Oct): „<H>: უპასუხა" said only THAT
 * someone replied. The goal already stores what they said, in a line of its
 * own („თანახმაა. რა გჭირდება მისგან კონკრეტულად?"), so the card says that after
 * the name. With nothing stored, the goal's own words for the state stay.
 */
export function answerLine(answer: LatestAnswer, language: RunLanguage): string {
  const gist = answerGist(answer.answer);
  const name = answer.to_name.trim();
  if (gist !== '') return `${nameToSay(name, language)}: ${gist}`;
  const state = answer.declined ? AskState.Declined : AskState.Answered;
  return ownerAskLine(name, { status: 'answered' }, state, language);
}

export function answerRef(askId: number): string {
  return `${ANSWER_REF_PREFIX}${String(askId)}`;
}

/**
 * #6768, URGENT since #6344 was merged into it (Giorgi, G-155, 20 Oct): Lika's
 * yes to his introduction request never reached „ბოლო სიახლეები". An answer to
 * an introduction request is not an ask's answer, so the card never read it.
 * It reads them now, said with the line the owner's conversation already has
 * for it, after the name of the person who answered.
 */
const INTRO_REF_PREFIX = 'intro_';
export const INTRO_ANSWER_KIND = 'intro_answer';
const ANSWERED_INTRO_STATES = ['accepted', 'declined'];

export interface LatestIntroAnswer {
  readonly request_id: number;
  readonly task_id: number | null;
  readonly thread_id: number | null;
  readonly case_title: string | null;
  /** The mediator as the owner saved them; null when the target answered directly. */
  readonly mediator_name: string | null;
  readonly target_name: string;
  readonly accepted: boolean;
  readonly answered_at: Date;
}

export async function latestIntroAnswers(
  userId: string,
  limit: number,
): Promise<LatestIntroAnswer[]> {
  const result = await query<LatestIntroAnswer>(
    `SELECT ir.id AS request_id, ir.requester_task_id AS task_id,
            COALESCE(t.thread_id, ir.requester_thread_id, ir.origin_thread_id) AS thread_id,
            th.short_title AS case_title,
            CASE WHEN ir.mediator_user_id IS NULL THEN NULL
                 ELSE ${nameAsSavedBySql('ir.requester_user_id', 'ir.mediator_user_id')} END
              AS mediator_name,
            ir.target_name, (ir.status = 'accepted') AS accepted, ir.responded_at AS answered_at
       FROM introduction_requests ir
       LEFT JOIN tasks t ON t.id = ir.requester_task_id
       LEFT JOIN threads th ON th.id = COALESCE(t.thread_id, ir.requester_thread_id, ir.origin_thread_id)
      WHERE ir.requester_user_id = $1::int
        AND ir.status = ANY($4::text[])
        AND ir.responded_at > NOW() - make_interval(days => $2)
      ORDER BY ir.responded_at DESC
      LIMIT $3`,
    [userId, ANSWERS_WINDOW_DAYS, limit, ANSWERED_INTRO_STATES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** „ლიკა: თემურზე გაცნობის მოთხოვნა მიღებულია." — the conversation's own line, after who answered. */
export function introAnswerLine(answer: LatestIntroAnswer, language: RunLanguage): string {
  const direct = answer.mediator_name === null;
  const line = introOutcomeLine(
    language,
    answer.target_name,
    answer.accepted,
    direct,
    answer.mediator_name,
  );
  return direct ? line : `${nameToSay(answer.mediator_name ?? '', language)}: ${line}`;
}

export function introAnswerRef(requestId: number): string {
  return `${INTRO_REF_PREFIX}${String(requestId)}`;
}
