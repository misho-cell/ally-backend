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
  /**
   * #6342 (Giorgi, G-087, goal 29308): the person this route leads to, at the
   * end of its path — even when they are not on Netai. An introduction's own
   * target; for a question, the goal's target when its plan names one. Null
   * when nobody is known, or when the person on this route IS the one sought.
   */
  readonly target_name: string | null;
}

export interface AskRow {
  readonly id: number;
  /** Who was asked; one route per person (4928). Absent on rows read elsewhere. */
  readonly person_id?: number;
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
  readonly person_id?: number;
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
    target_name: null,
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
    target_name: row.target_name,
  };
}

async function asksOf(userId: number, taskId: number): Promise<AskRow[]> {
  const result = await query<AskRow>(
    `SELECT ta.id, ta.to_user_id AS person_id, ${ASKED_AS_THE_ASKER_SAVED_THEM} AS name,
            ta.status, ta.answer,
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

/**
 * The goal's introductions, and the goal-less ones asked for in this same
 * conversation. 4927 (tester box 57263): the server's own introduction (CE)
 * from a chat with no goal carries only origin_thread_id, so the owner's path
 * stayed empty on every introduction made that way.
 */
async function introsOf(
  userId: number,
  taskId: number | null,
  threadId: number,
): Promise<IntroRow[]> {
  const result = await query<IntroRow>(
    `SELECT ir.id, ir.mediator_user_id AS person_id,
            ${nameAsSavedBySql('ir.requester_user_id', 'ir.mediator_user_id')} AS name,
            ir.status, ir.target_name, COALESCE(ir.responded_at, ir.created_at) AS updated_at
       FROM introduction_requests ir
      WHERE ir.requester_user_id = $2
        AND (ir.requester_task_id = $1
             OR (ir.requester_task_id IS NULL AND ir.origin_thread_id = $4))
      ORDER BY ir.created_at ASC
      LIMIT $3`,
    [taskId, userId, MAX_ROUTES, threadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

interface PersonRoute {
  readonly personId: number | undefined;
  readonly route: RouteRow;
}

/**
 * 4928 (Giorgi's retest, 13 Oct): one person showed three times — a follow-up,
 * a re-ask and an introduction are each a row. The board is about people:
 * each person once, in the place they first appeared, with their latest state.
 */
export function oncePerPerson(rows: readonly PersonRoute[]): RouteRow[] {
  const latest = new Map<number, RouteRow>();
  for (const { personId, route } of rows) {
    if (personId === undefined) continue;
    const held = latest.get(personId);
    if (held === undefined || route.updated_at >= held.updated_at) latest.set(personId, route);
  }
  const placed = new Set<number>();
  const out: RouteRow[] = [];
  for (const { personId, route } of rows) {
    if (personId === undefined) {
      out.push(route);
    } else if (!placed.has(personId)) {
      placed.add(personId);
      out.push(latest.get(personId) ?? route);
    }
  }
  return out;
}

/** The board for this conversation; an empty list when there is no board to draw. */
export async function routesForThread(userId: number, threadId: number): Promise<RouteRow[]> {
  const people = await routesOfOwnGoal(userId, threadId);
  return people.length >= MIN_ROUTES_FOR_A_BOARD ? people : [];
}

interface PlanRoutes {
  readonly routes?: ReadonlyArray<{ readonly introduction?: { readonly to_name?: unknown } }>;
}

/** #6342: the one person a plan's routes lead to; null when it names none or several. */
export function planTargetName(...plans: readonly unknown[]): string | null {
  const names = new Set<string>();
  for (const plan of plans) {
    for (const route of (plan as PlanRoutes | null)?.routes ?? []) {
      const name = route.introduction?.to_name;
      if (typeof name === 'string' && name.trim() !== '') names.add(name.trim());
    }
  }
  return names.size === 1 ? [...names][0] : null;
}

/** Best-effort: a path without its end is still a path, so a failed read draws none. */
async function goalTarget(taskId: number): Promise<string | null> {
  try {
    const result = await query<{ plan: unknown; plan_proposed: unknown }>(
      `SELECT plan, plan_proposed FROM tasks WHERE id = $1 LIMIT 1`,
      [taskId],
      QUERY_TIMEOUT_MS,
    );
    const row = result.rows[0];
    return row === undefined ? null : planTargetName(row.plan, row.plan_proposed);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[routes] goal ${taskId}: target not read:`, (err as Error).message);
    return null;
  }
}

/**
 * #6342 reopened (Giorgi's retest, 20 Oct): no plan names a target. Of the
 * last week's 165 plans not one carried an introduction's `to_name`, because
 * their routes are named after the helpers. Goal 29308's target, თემურ
 * ბოლოთაშვილი (not on Netai), is on its introduction request. So when the plan
 * names nobody, the goal's introductions do, if they all name one person (the
 * same start of the first name, so „თემური" and „თემურ ბოლოთაშვილი" are one).
 * The fullest spelling is shown.
 */
const SAME_PERSON_PREFIX = 4;

function personKey(name: string): string {
  return (name.trim().split(/\s+/u)[0] ?? '').toLowerCase().slice(0, SAME_PERSON_PREFIX);
}

export function introsTargetName(targetNames: readonly string[]): string | null {
  const names = [...new Set(targetNames.map((n) => n.trim()).filter((n) => n !== ''))];
  if (names.length === 0) return null;
  if (new Set(names.map(personKey)).size !== 1) return null;
  return names.reduce((longest, n) => (n.length > longest.length ? n : longest));
}

/** The person on this route is the one sought: the path ends at them, not past them. */
function isTheTarget(personName: string | null, target: string | null): boolean {
  return personName !== null && target !== null && personKey(personName) === personKey(target);
}

/** Every person this conversation's goal (or its goal-less introductions) is talking to, once each. */
export async function routesOfOwnGoal(userId: number, threadId: number): Promise<RouteRow[]> {
  const taskId = await goalOfOwnThread(userId, threadId);
  const [asks, intros, planTarget] = await Promise.all([
    taskId === null ? Promise.resolve([]) : asksOf(userId, taskId),
    introsOf(userId, taskId, threadId),
    taskId === null ? Promise.resolve(null) : goalTarget(taskId),
  ]);
  const target = planTarget ?? introsTargetName(intros.map((i) => i.target_name));
  const now = new Date();
  return oncePerPerson([
    ...asks.map((a) => ({
      personId: a.person_id,
      route: { ...askRoute(a, now), target_name: isTheTarget(a.name, target) ? null : target },
    })),
    ...intros.map((i) => ({ personId: i.person_id, route: introRoute(i) })),
  ]);
}
