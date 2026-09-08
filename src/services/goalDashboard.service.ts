import { query } from '../db/postgres/client';
import { GOAL_STAGE_SQL, GoalStage } from './goalQuestions.service';
import { TaskPlan } from './taskPlans.service';

/**
 * One goal, the way the founder wants to read it on the dashboard (Ticket 10
 * Task 28 (a); D127, 7 Sep): its stage, the actions taken with their times,
 * what it is blocked on, who pays for it, and how it ended.
 *
 * Everything here is a READ of what other modules wrote: the ask rows, the
 * engine's wake events in the goal's own thread, the plan stamps, the debrief
 * rungs. Nothing is stored for the dashboard's sake, so nothing can go stale.
 */

const DASHBOARD_QUERY_TIMEOUT_MS = 10_000;
const MAX_ACTIONS = 200;
const WAKE_SNIPPET_CHARS = 160;
const WAKE_PREFIX = '[მოვლენა]';
const WEEKLY_SUMMARY_PREFIX = 'კვირის შეჯამება';

export type GoalActionKind =
  | 'goal_created'
  | 'plan_approved'
  | 'question_to_owner'
  | 'question_defaulted'
  | 'circle_widened'
  | 'ask_sent'
  | 'follow_up_sent'
  | 'relay_sent'
  | 'answer_received'
  | 'answer_automatic'
  | 'wake'
  | 'weekly_summary'
  | 'debrief_worked'
  | 'debrief_did_not_work'
  | 'closed';

export interface GoalAction {
  at: string;
  kind: GoalActionKind;
  /** The person written to, the question asked, the wake's first line, the close reason. */
  detail: string | null;
  /** The ask or message row behind the action, when there is one. */
  ref_id: number | null;
}

export type GoalBlocker =
  | { kind: 'owner_question'; question: string | null; since: string | null }
  | { kind: 'awaiting_reply'; people: string[]; since: string | null }
  | { kind: 'plan_approval'; since: string | null }
  | { kind: 'topup'; balance: number };

export interface GoalOutcome {
  state: 'open' | 'solved' | 'stopped' | 'paused';
  closed_reason: string | null;
  closed_at: string | null;
  /** Debrief answers on this goal's relayed asks (D49). */
  asks_worked: number;
  asks_did_not_work: number;
}

export interface GoalDetail {
  id: number;
  title: string;
  status: string;
  brief: string | null;
  stage: GoalStage;
  created_at: string;
  last_activity_at: string;
  next_wake_at: string | null;
  thread_id: number | null;
  plan: TaskPlan | null;
  plan_proposed: TaskPlan | null;
  plan_version: number;
  plan_approved_at: string | null;
  /** The account every run and every ask of this goal is charged to (D123). */
  payer: { user_id: string; name: string | null; balance: number };
  blocker: GoalBlocker | null;
  outcome: GoalOutcome;
  actions: GoalAction[];
}

interface GoalRow {
  id: number;
  user_id: string;
  title: string;
  status: string;
  brief: string | null;
  stage: GoalStage;
  closed_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_activity_at: Date | string;
  next_wake_at: Date | string | null;
  thread_id: number | null;
  plan: TaskPlan | null;
  plan_proposed: TaskPlan | null;
  plan_version: number | null;
  plan_approved_at: Date | string | null;
  pending_question: string | null;
  pending_question_at: Date | string | null;
  owner_name: string | null;
  owner_balance: string | null;
  asks_worked: string;
  asks_did_not_work: string;
}

interface ActionRow {
  at: Date | string;
  kind: GoalActionKind;
  detail: string | null;
  ref_id: number | null;
}

interface PendingAskRow {
  name: string | null;
  created_at: Date | string;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function goalRow(userId: string, taskId: number): Promise<GoalRow | null> {
  const result = await query<GoalRow>(
    `SELECT t.id, t.user_id, t.title, t.status, t.brief, t.closed_reason, t.created_at,
            t.updated_at, t.last_activity_at, t.next_wake_at, t.thread_id, t.plan,
            t.plan_proposed, t.plan_version, t.plan_approved_at, t.pending_question,
            t.pending_question_at,
            ${GOAL_STAGE_SQL} AS stage,
            (SELECT u.name FROM "User" u WHERE u.id = t.user_id::int) AS owner_name,
            (SELECT SUM(tt.amount) FROM token_transactions tt WHERE tt.user_id = t.user_id)
              AS owner_balance,
            (SELECT COUNT(*) FROM outcome_events o JOIN task_asks a ON a.id::text = o.subject_id
              WHERE o.subject_type = 'task_ask' AND a.task_id = t.id AND o.outcome = 'worked')
              AS asks_worked,
            (SELECT COUNT(*) FROM outcome_events o JOIN task_asks a ON a.id::text = o.subject_id
              WHERE o.subject_type = 'task_ask' AND a.task_id = t.id AND o.outcome = 'did_not_work')
              AS asks_did_not_work
     FROM tasks t
     WHERE t.id = $1 AND t.user_id = $2
     LIMIT 1`,
    [taskId, userId],
    DASHBOARD_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/**
 * Every dated thing that happened on the goal, oldest first. Each branch reads
 * one table; the union is the timeline. Text that crosses accounts (the wake
 * event, the question) is already scrubbed where it was written.
 */
async function goalActions(taskId: number): Promise<GoalAction[]> {
  const result = await query<ActionRow>(
    `SELECT at, kind, detail, ref_id FROM (
       SELECT t.created_at AS at, 'goal_created' AS kind, t.title AS detail, NULL::int AS ref_id
         FROM tasks t WHERE t.id = $1
       UNION ALL
       SELECT t.plan_approved_at, 'plan_approved', 'v' || t.plan_version, NULL
         FROM tasks t WHERE t.id = $1 AND t.plan_approved_at IS NOT NULL
       UNION ALL
       SELECT t.pending_question_at, 'question_to_owner', t.pending_question, NULL
         FROM tasks t WHERE t.id = $1 AND t.pending_question_at IS NOT NULL
       UNION ALL
       SELECT t.pending_question_defaulted_at, 'question_defaulted', NULL, NULL
         FROM tasks t WHERE t.id = $1 AND t.pending_question_defaulted_at IS NOT NULL
       UNION ALL
       SELECT t.silent_day_woken_at, 'circle_widened', NULL, NULL
         FROM tasks t WHERE t.id = $1 AND t.silent_day_woken_at IS NOT NULL
       UNION ALL
       SELECT t.updated_at, 'closed', t.closed_reason, NULL
         FROM tasks t WHERE t.id = $1 AND t.status = 'closed'
       UNION ALL
       SELECT a.created_at,
              CASE WHEN a.parent_ask_id IS NOT NULL THEN 'relay_sent'
                   WHEN a.is_follow_up THEN 'follow_up_sent'
                   ELSE 'ask_sent' END,
              u.name, a.id
         FROM task_asks a LEFT JOIN "User" u ON u.id = a.to_user_id WHERE a.task_id = $1
       UNION ALL
       SELECT a.answered_at,
              CASE WHEN a.automatic THEN 'answer_automatic' ELSE 'answer_received' END,
              u.name, a.id
         FROM task_asks a LEFT JOIN "User" u ON u.id = a.to_user_id
         WHERE a.task_id = $1 AND a.answered_at IS NOT NULL
       UNION ALL
       SELECT c.created_at, 'wake', LEFT(c.content, $3), c.id
         FROM conversations c JOIN tasks t ON t.thread_id = c.thread_id
         WHERE t.id = $1 AND c.role = 'user' AND c.content LIKE $4 || '%'
       UNION ALL
       SELECT c.created_at, 'weekly_summary', NULL, c.id
         FROM conversations c JOIN tasks t ON t.thread_id = c.thread_id
         WHERE t.id = $1 AND c.role = 'assistant' AND c.content LIKE $5 || '%'
       UNION ALL
       SELECT o.created_at, 'debrief_' || o.outcome, NULL, a.id
         FROM outcome_events o JOIN task_asks a ON a.id::text = o.subject_id
         WHERE o.subject_type = 'task_ask' AND a.task_id = $1
           AND o.outcome IN ('worked', 'did_not_work')
     ) x
     ORDER BY at
     LIMIT $2`,
    [taskId, MAX_ACTIONS, WAKE_SNIPPET_CHARS, WAKE_PREFIX, WEEKLY_SUMMARY_PREFIX],
    DASHBOARD_QUERY_TIMEOUT_MS,
  );
  return result.rows
    .map((r) => ({ at: iso(r.at), kind: r.kind, detail: r.detail, ref_id: r.ref_id }))
    .filter((r): r is GoalAction => r.at !== null);
}

async function pendingAsks(taskId: number): Promise<PendingAskRow[]> {
  const result = await query<PendingAskRow>(
    `SELECT u.name, a.created_at FROM task_asks a
     LEFT JOIN "User" u ON u.id = a.to_user_id
     WHERE a.task_id = $1 AND a.status = 'sent'
     ORDER BY a.created_at
     LIMIT $2`,
    [taskId, MAX_ACTIONS],
    DASHBOARD_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** What the goal is waiting on, read off the stage the list already shows. */
export function blockerFor(
  stage: GoalStage,
  row: Pick<GoalRow, 'pending_question' | 'pending_question_at' | 'owner_balance'>,
  pending: PendingAskRow[],
): GoalBlocker | null {
  switch (stage) {
    case 'waiting_on_user':
      return {
        kind: 'owner_question',
        question: row.pending_question,
        since: iso(row.pending_question_at),
      };
    case 'waiting_on_reply':
      return {
        kind: 'awaiting_reply',
        people: pending.map((p) => p.name ?? 'უცნობი'),
        since: iso(pending[0]?.created_at ?? null),
      };
    case 'plan_proposed':
      return { kind: 'plan_approval', since: null };
    case 'waiting_topup':
      return { kind: 'topup', balance: Number(row.owner_balance ?? 0) };
    default:
      return null;
  }
}

function outcomeFor(row: GoalRow, stage: GoalStage): GoalOutcome {
  const state: GoalOutcome['state'] =
    stage === 'solved' || stage === 'stopped' || stage === 'paused' ? stage : 'open';
  return {
    state,
    closed_reason: row.closed_reason,
    closed_at: row.status === 'closed' ? iso(row.updated_at) : null,
    asks_worked: Number(row.asks_worked),
    asks_did_not_work: Number(row.asks_did_not_work),
  };
}

/**
 * The 14-day acceptance test as data (the standard, Part I §3; Task 29).
 *
 * One row per day: asks sent (with the user's yes — every ask has one), replies
 * relayed in, the circle widened or the method changed, a status line to the
 * user (an assistant reply in the goal's thread), and whether the day was
 * silent — none of the five. The table the founder's seat was to fill by hand
 * every morning is read here in one call, so a silent day cannot be missed or
 * argued about.
 */
const ACCEPTANCE_TEST_DAYS = 14;
const MAX_ACCEPTANCE_DAYS = 60;

export interface GoalDay {
  day: string;
  asks_sent: number;
  replies_in: number;
  circle_widened: boolean;
  method_changed: boolean;
  status_lines: number;
  silent: boolean;
}

export interface GoalDaysReport {
  task_id: number;
  from: string;
  to: string;
  days: GoalDay[];
  silent_days: number;
  active_days: number;
}

interface GoalDayRow {
  day: Date | string;
  asks_sent: string;
  replies_in: string;
  circle_widened: boolean;
  method_changed: boolean;
  status_lines: string;
}

/** Null when the goal does not exist or is not this user's. */
export async function goalDays(
  userId: string,
  taskId: number,
  days = ACCEPTANCE_TEST_DAYS,
): Promise<GoalDaysReport | null> {
  const span = Math.min(Math.max(1, Math.floor(days)), MAX_ACCEPTANCE_DAYS);
  const owned = await query<{ id: number }>(
    `SELECT id FROM tasks WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [taskId, userId],
    DASHBOARD_QUERY_TIMEOUT_MS,
  );
  if (owned.rows.length === 0) return null;
  const result = await query<GoalDayRow>(
    `WITH d AS (
       SELECT generate_series(
         (CURRENT_DATE - ($2::int - 1))::date, CURRENT_DATE, INTERVAL '1 day')::date AS day
     )
     SELECT d.day,
            (SELECT COUNT(*) FROM task_asks a
              WHERE a.task_id = $1 AND a.created_at::date = d.day) AS asks_sent,
            (SELECT COUNT(*) FROM task_asks a
              WHERE a.task_id = $1 AND a.answered_at::date = d.day) AS replies_in,
            EXISTS (SELECT 1 FROM tasks t
                     WHERE t.id = $1 AND t.silent_day_woken_at::date = d.day) AS circle_widened,
            EXISTS (SELECT 1 FROM tasks t
                     WHERE t.id = $1 AND t.plan_version > 1
                       AND t.plan_approved_at::date = d.day) AS method_changed,
            (SELECT COUNT(*) FROM conversations c JOIN tasks t ON t.thread_id = c.thread_id
              WHERE t.id = $1 AND c.role = 'assistant' AND c.kind = 'message'
                AND c.created_at::date = d.day) AS status_lines
     FROM d
     ORDER BY d.day`,
    [taskId, span],
    DASHBOARD_QUERY_TIMEOUT_MS,
  );
  const rows: GoalDay[] = result.rows.map((r) => {
    const asksSent = Number(r.asks_sent);
    const repliesIn = Number(r.replies_in);
    const statusLines = Number(r.status_lines);
    return {
      day: (iso(r.day) ?? '').slice(0, 10),
      asks_sent: asksSent,
      replies_in: repliesIn,
      circle_widened: r.circle_widened,
      method_changed: r.method_changed,
      status_lines: statusLines,
      silent:
        asksSent === 0 &&
        repliesIn === 0 &&
        !r.circle_widened &&
        !r.method_changed &&
        statusLines === 0,
    };
  });
  const silentDays = rows.filter((r) => r.silent).length;
  return {
    task_id: taskId,
    from: rows[0]?.day ?? '',
    to: rows[rows.length - 1]?.day ?? '',
    days: rows,
    silent_days: silentDays,
    active_days: rows.length - silentDays,
  };
}

/** Null when the goal does not exist or is not this user's. */
export async function adminGoalDetail(userId: string, taskId: number): Promise<GoalDetail | null> {
  const row = await goalRow(userId, taskId);
  if (!row) return null;
  const [actions, pending] = await Promise.all([goalActions(taskId), pendingAsks(taskId)]);
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    brief: row.brief,
    stage: row.stage,
    created_at: iso(row.created_at) ?? '',
    last_activity_at: iso(row.last_activity_at) ?? '',
    next_wake_at: iso(row.next_wake_at),
    thread_id: row.thread_id,
    plan: row.plan,
    plan_proposed: row.plan_proposed,
    plan_version: row.plan_version ?? 0,
    plan_approved_at: iso(row.plan_approved_at),
    payer: {
      user_id: row.user_id,
      name: row.owner_name,
      balance: Number(row.owner_balance ?? 0),
    },
    blocker: blockerFor(row.stage, row, pending),
    outcome: outcomeFor(row, row.stage),
    actions,
  };
}
