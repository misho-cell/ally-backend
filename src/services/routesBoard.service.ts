import { query } from '../db/postgres/client';
import { AskState, askStateOf } from './askState';
import { scrubText, stripAllowedSpans } from './privacyScrub';
import { ASKED_AS_THE_ASKER_SAVED_THEM, nameAsSavedBySql } from './savedNameSql';

/**
 * D722, the frontend's 06:30Z item 2 (Misho: the new design's full list): on
 * a goal where Netai talks to more than one person in parallel, the goal's
 * conversation shows a board — one row per person, who they are to this goal
 * and where their part stands.
 *
 * Read for the conversation's owner only, from what this goal itself sent: its
 * own asks (the person is asked) and its introduction requests (the person is
 * the bridge). Names are the owner's own saved names. An answer is shown the
 * way the owner already reads it in the chat (numbers scrubbed, a shared
 * number kept). A relayed question further down a chain is another person's
 * and is not listed.
 */
const QUERY_TIMEOUT_MS = 5_000;
/** A board only makes sense with two people or more (the design's rule). */
export const MIN_ROUTES_FOR_A_BOARD = 2;
const MAX_ROUTES = 50;
export const SUMMARY_MAX_CHARS = 200;

export enum RouteRole {
  Addressee = 'addressee',
  Mediator = 'mediator',
}

export enum RouteState {
  Waiting = 'waiting',
  Confirmed = 'confirmed',
  Answered = 'answered',
  Declined = 'declined',
  Closed = 'closed',
}

export interface RouteRow {
  readonly ask_id: number;
  readonly kind: 'ask' | 'introduction';
  readonly person_name: string | null;
  readonly role: RouteRole;
  readonly state: RouteState;
  readonly summary: string | null;
  readonly updated_at: string;
}

interface AskRow {
  readonly id: number;
  readonly name: string | null;
  readonly status: string;
  readonly answer: string | null;
  readonly declined_at: string | null;
  readonly seen_at: string | null;
  readonly later_until: string | null;
  readonly expired_at: string | null;
  readonly updated_at: string;
}

interface IntroRow {
  readonly id: number;
  readonly name: string | null;
  readonly status: string;
  readonly target_name: string;
  readonly updated_at: string;
}

const STATE_OF_ASK: Readonly<Record<AskState, RouteState>> = {
  [AskState.Held]: RouteState.Waiting,
  [AskState.Sent]: RouteState.Waiting,
  [AskState.Seen]: RouteState.Waiting,
  [AskState.Later]: RouteState.Waiting,
  [AskState.Answered]: RouteState.Answered,
  [AskState.Declined]: RouteState.Declined,
  [AskState.Expired]: RouteState.Closed,
  [AskState.Cancelled]: RouteState.Closed,
};

const STATE_OF_INTRO: Readonly<Record<string, RouteState>> = {
  pending: RouteState.Waiting,
  accepted: RouteState.Confirmed,
  declined: RouteState.Declined,
};

/** The open-or-latest goal on this conversation, when the conversation is this user's. */
async function goalOfOwnThread(userId: number, threadId: number): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT t.id FROM tasks t
       JOIN threads th ON th.id = t.thread_id
      WHERE t.thread_id = $1 AND th.user_id = $2 AND t.user_id = $2::text
      ORDER BY t.id DESC LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.id ?? null;
}

export function summaryOf(answer: string | null): string | null {
  if (answer === null || answer.trim() === '') return null;
  const shown = stripAllowedSpans(scrubText(answer)).trim();
  return shown === '' ? null : shown.slice(0, SUMMARY_MAX_CHARS);
}

export function askRoute(row: AskRow, now: Date): RouteRow {
  return {
    ask_id: row.id,
    kind: 'ask',
    person_name: row.name,
    role: RouteRole.Addressee,
    state: STATE_OF_ASK[askStateOf(row, now)],
    summary: summaryOf(row.answer),
    updated_at: row.updated_at,
  };
}

export function introRoute(row: IntroRow): RouteRow {
  return {
    ask_id: row.id,
    kind: 'introduction',
    person_name: row.name,
    role: RouteRole.Mediator,
    state: STATE_OF_INTRO[row.status] ?? RouteState.Closed,
    summary: row.target_name,
    updated_at: row.updated_at,
  };
}

async function asksOf(userId: number, taskId: number): Promise<AskRow[]> {
  const result = await query<AskRow>(
    `SELECT ta.id, ${ASKED_AS_THE_ASKER_SAVED_THEM} AS name, ta.status, ta.answer,
            ta.declined_at, ta.seen_at, ta.later_until, ta.expired_at,
            GREATEST(ta.created_at, ta.answered_at, ta.declined_at, ta.seen_at, ta.expired_at)
              AS updated_at
       FROM task_asks ta
      WHERE ta.task_id = $1 AND ta.from_user_id = $2 AND ta.parent_ask_id IS NULL
      ORDER BY ta.created_at ASC
      LIMIT $3`,
    [taskId, userId, MAX_ROUTES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function introsOf(userId: number, taskId: number): Promise<IntroRow[]> {
  const result = await query<IntroRow>(
    `SELECT ir.id, ${nameAsSavedBySql('ir.requester_user_id', 'ir.mediator_user_id')} AS name,
            ir.status, ir.target_name, COALESCE(ir.responded_at, ir.created_at) AS updated_at
       FROM introduction_requests ir
      WHERE ir.requester_task_id = $1 AND ir.requester_user_id = $2
      ORDER BY ir.created_at ASC
      LIMIT $3`,
    [taskId, userId, MAX_ROUTES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The board for this conversation; an empty list when there is no board to draw. */
export async function routesForThread(userId: number, threadId: number): Promise<RouteRow[]> {
  const taskId = await goalOfOwnThread(userId, threadId);
  if (taskId === null) return [];
  const [asks, intros] = await Promise.all([asksOf(userId, taskId), introsOf(userId, taskId)]);
  const now = new Date();
  const routes = [...asks.map((a) => askRoute(a, now)), ...intros.map(introRoute)];
  return routes.length >= MIN_ROUTES_FOR_A_BOARD ? routes : [];
}
