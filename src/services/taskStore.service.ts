import { query } from '../db/postgres/client';
import { setThreadStatus } from './threadStatus.service';
import { RunLanguage, RUN_STRINGS } from './runLanguage';
import { userLanguage } from './threads.service';
import { markThreadStopped } from './stoppedRuns';
import { goalNamedIn } from './goalMention';
import type { TaskPlan } from './taskPlans.service';

const QUERY_TIMEOUT_MS = 8_000;
const OPEN_TASKS_LIMIT = 50;

export const TASK_TYPES = ['solve', 'reach'] as const;
export const TASK_STATUSES = ['open', 'paused', 'closed'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_AUTONOMY_MODES = ['ask_first', 'autonomous'] as const;
export type TaskAutonomy = (typeof TASK_AUTONOMY_MODES)[number];

export function isTaskAutonomy(v: string): v is TaskAutonomy {
  return (TASK_AUTONOMY_MODES as readonly string[]).includes(v);
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  permission_granted: boolean;
  thread_id: number | null;
  autonomy: string;
  brief: string | null;
  next_wake_at: string | null;
  /** Ticket 8 Task 2: the exact question this goal is blocked on, if any. */
  pending_question: string | null;
  /**
   * WHEN the goal became blocked on the owner — set even when the question
   * has no text (the engine's fallback refuses to guess which goal a closing
   * question belonged to). This, not `pending_question`, is what says a goal
   * is waiting: threadAwaitsOwner reads it, and Ticket 19 G9 is what happens
   * when something else reads the text instead.
   */
  pending_question_at: string | null;
  /** The plan in force (Ticket 10 Task 21, D119) — consent was given to THIS. */
  plan: TaskPlan | null;
  /** The next version, waiting for the user's yes; the one in force keeps running. */
  plan_proposed: TaskPlan | null;
  plan_approved_at: string | null;
  plan_version: number;
  /**
   * Row 238 (D119): the owner has asked for a change and not yet given a new
   * yes. NOT a revocation — the plan stays approved and what is in flight
   * keeps running; only the wakes that would START a new wave stand down.
   */
  plan_change_requested_at: string | null;
  created_at: string;
  last_activity_at: string;
}

export function isTaskType(v: string): v is TaskType {
  return (TASK_TYPES as readonly string[]).includes(v);
}

export function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

/**
 * Save a goal as a standing task, bound to the thread it was created in
 * (1 task = 1 thread — the engine wakes the task INTO that thread).
 */
export async function createTask(
  userId: string,
  title: string,
  description: string | null,
  taskType: TaskType,
  threadId?: number,
  autonomy: TaskAutonomy = 'ask_first',
): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `INSERT INTO tasks (user_id, title, description, task_type, thread_id, autonomy)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, title, description, taskType, threadId ?? null, autonomy],
    QUERY_TIMEOUT_MS,
  );
  if (threadId !== undefined) {
    await retitleThreadIfStale(threadId, title);
    await markThreadAsGoal(threadId);
  }
  return { id: result.rows[0].id };
}

/**
 * The thread carries a goal from the moment the goal exists (ticket 9 task
 * 20 e).
 *
 * Four goals opened from chat on 2 September read `is_task: false` through
 * turns two, three and four — after „ბრიფი ჩაწერილია" and after a wake was
 * set — and only turned true on `finish_task`. The chat route flipped the flag
 * on `requestCreated || taskResult`, and opening a goal is neither: it sends no
 * introduction request and reports no finished result. So nothing on the thread
 * told the sidebar, the badge or a reader that the conversation belonged to an
 * open goal.
 *
 * Set here rather than in the route, because the connector opens goals too and
 * the fact is the same wherever it happened. The flag only ever moves to true:
 * a thread that has carried a goal has carried one.
 */
async function markThreadAsGoal(threadId: number): Promise<void> {
  await query(
    `UPDATE threads SET is_task = TRUE, updated_at = NOW()
     WHERE id = $1 AND is_task = FALSE`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
}

/** A thread title is capped the same way the rename route caps one. */
const MAX_THREAD_TITLE_CHARS = 80;

/**
 * A thread keeps the name of the goal it was opened for — and thread 9010 was
 * still called „Netai-ს ბეტა-ტესტერები" while carrying the dog-trainer goal,
 * because goal 1354 closed there and goal 1420 opened in the same thread
 * (ticket 9 task 31.8). The "1 task = 1 thread" line above is the intent, not
 * the data.
 *
 * Deliberately narrow: the title is replaced ONLY when it is literally the
 * title of a goal on this thread that is no longer open. A name the user typed
 * themselves, or one the summariser derived from the conversation, matches
 * nothing here and is never touched — renaming somebody's thread out from
 * under them would be a worse bug than the stale name.
 */
async function retitleThreadIfStale(threadId: number, newTitle: string): Promise<void> {
  await query(
    `UPDATE threads t
     SET title = $2, updated_at = NOW()
     WHERE t.id = $1
       AND EXISTS (
         SELECT 1 FROM tasks old
         WHERE old.thread_id = t.id AND old.status <> 'open' AND old.title = t.title
       )`,
    [threadId, newTitle.slice(0, MAX_THREAD_TITLE_CHARS)],
    QUERY_TIMEOUT_MS,
  );
}

const TASK_COLUMNS = `id, user_id, title, description, task_type, status, permission_granted,
            thread_id, autonomy, brief, next_wake_at, pending_question, pending_question_at,
            plan, plan_proposed, plan_approved_at, plan_version, plan_change_requested_at,
            created_at, last_activity_at`;

/**
 * The open goal a message NAMES, when the thread it arrived in is bound to
 * none (Ticket 10 Task 18 / Task 21 (1)).
 *
 * „ბათუმის ფოტოგრაფის მიზანი გავაგრძელოთ. რა ხდება იქ?" typed into a fresh
 * chat is a turn of the Batumi-photographer goal, and ran as a quick answer
 * because only `tasks.thread_id` was ever consulted. The title in the message
 * is as hard a fact as the thread id; the matcher (goalMention.ts) is strict
 * enough that a shared first name names nothing.
 */
export async function findOpenTaskNamedIn(userId: string, message: string): Promise<Task | null> {
  const result = await query<Task>(
    `SELECT ${TASK_COLUMNS} FROM tasks
     WHERE user_id = $1 AND status = 'open'
     ORDER BY last_activity_at DESC LIMIT $2`,
    [userId, OPEN_TASKS_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return goalNamedIn(message, result.rows);
}

/** The open task bound to a thread — what makes a run a "task step" run. */
/**
 * Ticket 20 row 113 — the goal this chat belongs to, WHATEVER its status.
 *
 * `getOpenTaskByThread` answers null for a paused or closed goal, which is
 * right when the question is „is there work running here" and catastrophic
 * when the question is „which goal is this chat about". 17 September, the
 * tester, account 501:
 *
 *   goal 4756, thread 16842, PAUSED. „stop this goal, it was a test" typed in
 *   its own chat. Nothing on the thread answered — so the model chose another
 *   of the owner's open goals and closed it. Twice. Both were the founder's
 *   real goals; one had already sent two asks to real people.
 *
 * A chat has ONE goal and it does not stop having it when it pauses. This is
 * the question every „which goal did they mean" has to ask, and asking the
 * open-only version is how „their goal" became „some goal of theirs".
 */
export async function getGoalOnThread(threadId: number): Promise<Task | null> {
  const result = await query<Task>(
    `SELECT ${TASK_COLUMNS} FROM tasks
     WHERE thread_id = $1
     ORDER BY id DESC LIMIT 1`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

export async function getOpenTaskByThread(threadId: number): Promise<Task | null> {
  const result = await query<Task>(
    `SELECT ${TASK_COLUMNS} FROM tasks
     WHERE thread_id = $1 AND status = 'open'
     ORDER BY id DESC LIMIT 1`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/**
 * Is an OPEN goal on this thread waiting for the owner's answer right now?
 *
 * `pending_question_at` and not `pending_question`: the engine's fallback flag
 * carries the wait without the text (it refuses to guess which goal a wake
 * reply's closing question belonged to), and a goal waiting with an unnamed
 * question is still waiting.
 */
export async function threadAwaitsOwner(threadId: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT id FROM tasks
     WHERE thread_id = $1 AND status = 'open' AND pending_question_at IS NOT NULL
     LIMIT 1`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/**
 * Has this goal already reached somebody outside the app — an ask relayed to a
 * contact, or an introduction request sent for it?
 *
 * The seat's 391 found a plan proposed nine seconds after the mediator had
 * already answered, and the mechanism is plain once the two timestamps are put
 * side by side: `startPlanProposal` is queued four seconds after a goal is
 * created and retried while the thread is busy, so on a goal that spends that
 * minute actually DOING the thing, the proposal lands after the work.
 *
 * Measured rather than argued, and it is not one instance. Of 214 proposals in
 * the six days `tool_call_log` covers, five came after the goal had already
 * acted — and three of those five are 47, 55 and 64 seconds, one on each of
 * the 19th, 20th and 21st. The other two are eight days and a day apart and
 * cannot be this timer at all; they are the model proposing on its own, which
 * this function does not gate.
 *
 * `LIMIT 1` on each side: the question is whether there is any, never how many.
 */
export async function goalHasActedOutward(taskId: number): Promise<boolean> {
  const result = await query<{ acted: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM task_asks WHERE task_id = $1 LIMIT 1)
         OR EXISTS (SELECT 1 FROM introduction_requests WHERE requester_task_id = $1 LIMIT 1)
       AS acted`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.acted === true;
}

export async function getTaskById(taskId: number): Promise<(Task & { user_id: string }) | null> {
  const result = await query<Task & { user_id: string }>(
    `SELECT user_id, ${TASK_COLUMNS} FROM tasks WHERE id = $1 LIMIT 1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** The model's operative plan for the task — rewritten as work progresses. */
export async function setTaskBrief(
  userId: string,
  taskId: number,
  brief: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET brief = $3, updated_at = NOW(), last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'`,
    [taskId, userId, brief],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setTaskAutonomy(
  userId: string,
  taskId: number,
  autonomy: TaskAutonomy,
): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET autonomy = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [taskId, userId, autonomy],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Schedule the task's next self-wake (revisit, reminder, summary deadline). */
export async function setTaskWake(userId: string, taskId: number, hours: number): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET next_wake_at = NOW() + ($3 || ' hours')::interval, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'`,
    [taskId, userId, hours],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Open tasks whose wake time has arrived — the ticker's worklist. */
export async function getDueTasks(limit: number): Promise<Array<Task & { user_id: string }>> {
  const result = await query<Task & { user_id: string }>(
    `SELECT user_id, ${TASK_COLUMNS} FROM tasks
     WHERE status = 'open' AND next_wake_at IS NOT NULL AND next_wake_at <= NOW()
       -- Row 238 (D119): the owner has asked for a change and not yet given a
       -- new yes. The plan stays approved and what is in flight keeps running;
       -- this is the AUTOMATIC next wave, and it waits.
       AND plan_change_requested_at IS NULL
     ORDER BY next_wake_at ASC
     LIMIT $1`,
    [limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Open tasks with NO scheduled wake and no activity for a while — the nightly
 * review's worklist (the model re-checks the network for new matches).
 */
export async function getStaleOpenTasks(
  hoursQuiet: number,
  limit: number,
): Promise<Array<Task & { user_id: string }>> {
  const result = await query<Task & { user_id: string }>(
    `SELECT user_id, ${TASK_COLUMNS} FROM tasks
     WHERE status = 'open' AND next_wake_at IS NULL
       AND last_activity_at < NOW() - ($1 || ' hours')::interval
     ORDER BY last_activity_at ASC
     LIMIT $2`,
    [hoursQuiet, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Line 6 of the standard (D117): a question to the user never stops the work.
 * Goals whose question has waited a full day and has not yet had its harmless
 * default taken — oldest first.
 */
export async function getGoalsUnansweredForADay(hours: number, limit: number): Promise<Task[]> {
  const result = await query<Task>(
    `SELECT ${TASK_COLUMNS} FROM tasks
     WHERE status = 'open'
       AND pending_question_at IS NOT NULL
       AND pending_question_at < NOW() - ($1 || ' hours')::interval
       AND (pending_question_defaulted_at IS NULL
            OR pending_question_defaulted_at < pending_question_at)
     ORDER BY pending_question_at ASC
     LIMIT $2`,
    [hours, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Line 3 of the standard (D117, D119): a silent day widens the circle.
 *
 * Goals with a plan in force whose newest ask has waited a day with no answer
 * and nothing newer sent, and that have not been woken for this silence yet.
 * Without a plan there is no circle to widen inside, so those are left to the
 * nightly review.
 */
export async function getSilentGoals(hours: number, limit: number): Promise<Task[]> {
  const result = await query<Task>(
    `SELECT ${TASK_COLUMNS} FROM tasks t
     WHERE t.status = 'open' AND t.plan IS NOT NULL
       -- Row 238 (D119): widening the circle is a new wave, and the owner has
       -- asked for the plan to change. It waits for their yes.
       AND t.plan_change_requested_at IS NULL
       AND EXISTS (SELECT 1 FROM task_asks a
                   WHERE a.task_id = t.id AND a.status = 'sent'
                     AND a.created_at < NOW() - ($1 || ' hours')::interval)
       AND NOT EXISTS (SELECT 1 FROM task_asks a
                       WHERE a.task_id = t.id
                         AND a.created_at >= NOW() - ($1 || ' hours')::interval)
       AND (t.silent_day_woken_at IS NULL
            OR t.silent_day_woken_at < NOW() - ($1 || ' hours')::interval)
     ORDER BY t.last_activity_at ASC
     LIMIT $2`,
    [hours, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Line 4 of the standard (D117; Ticket 10 Task 24 (b)): three silent days
 * change the method. Goals with a plan whose newest ask has waited three days
 * unanswered, with nothing newer sent, no plan change already waiting for the
 * owner's yes, and no method-change wake in the last three days.
 */
export async function getGoalsSilentForDays(hours: number, limit: number): Promise<Task[]> {
  const result = await query<Task>(
    `SELECT ${TASK_COLUMNS} FROM tasks t
     WHERE t.status = 'open' AND t.plan IS NOT NULL AND t.plan_proposed IS NULL
       AND EXISTS (SELECT 1 FROM task_asks a
                   WHERE a.task_id = t.id AND a.status = 'sent'
                     AND a.created_at < NOW() - ($1 || ' hours')::interval)
       AND NOT EXISTS (SELECT 1 FROM task_asks a
                       WHERE a.task_id = t.id
                         AND (a.created_at >= NOW() - ($1 || ' hours')::interval
                              OR a.answered_at >= NOW() - ($1 || ' hours')::interval))
       AND (t.method_change_woken_at IS NULL
            OR t.method_change_woken_at < NOW() - ($1 || ' hours')::interval)
     ORDER BY t.last_activity_at ASC
     LIMIT $2`,
    [hours, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export async function markMethodChangeWoken(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET method_change_woken_at = NOW() WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
}

/**
 * Line 9 of the standard, the engine's half (Ticket 10 Task 10 (1)): an open
 * goal always has a next wake. When a run ends without the model scheduling
 * one, the default is set here — the goal is revisited, never parked. A wake
 * the model did set is left exactly as it is.
 */
export async function ensureNextWake(taskId: number, hours: number): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET next_wake_at = NOW() + ($2 || ' hours')::interval
     WHERE id = $1 AND status = 'open' AND next_wake_at IS NULL`,
    [taskId, hours],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markSilentDayWoken(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET silent_day_woken_at = NOW() WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
}

/** The default was taken for the question currently open — once per question. */
export async function markQuestionDefaulted(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET pending_question_defaulted_at = NOW() WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
}

/** Every open goal on a thread was worked on when the thread got a reply. */
export async function touchTaskActivityForThread(threadId: number): Promise<void> {
  await query(
    `UPDATE tasks SET last_activity_at = NOW() WHERE thread_id = $1 AND status = 'open'`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
}

export async function touchTaskActivity(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET last_activity_at = NOW() WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
}

export async function clearTaskWake(taskId: number): Promise<void> {
  await query(`UPDATE tasks SET next_wake_at = NULL WHERE id = $1`, [taskId], QUERY_TIMEOUT_MS);
}

/** The user's tasks (open by default) — how a fresh chat learns what it was doing. */
/**
 * The same page as getMyTasks, with the account's real goal count beside it
 * (Ticket 16 Task 64): the connector printed the page size as the total.
 */
export async function getMyTasksPage(
  userId: string,
  status?: TaskStatus,
): Promise<{ tasks: Task[]; total: number }> {
  const [tasks, total] = await Promise.all([
    getMyTasks(userId, status),
    query<{ count: string }>(
      // Row 258: the SAME exclusion as the list below it. A count that
      // includes what the list leaves out is the `due`/`held` disagreement one
      // file over — two numbers about one thing, and the reader believes the
      // one that is wrong.
      `SELECT COUNT(*) AS count FROM tasks t
       WHERE t.user_id = $1 AND ($2::text IS NULL OR t.status = $2)
         AND NOT EXISTS (SELECT 1 FROM hidden_goals h WHERE h.task_id = t.id)`,
      [userId, status ?? null],
      QUERY_TIMEOUT_MS,
    ),
  ]);
  return { tasks, total: Number(total.rows[0]?.count ?? tasks.length) };
}

export async function getMyTasks(userId: string, status?: TaskStatus): Promise<Task[]> {
  const result = await query<Task>(
    // Ticket 20 row 134: the plan columns are SELECTED, because the connector
    // derives „has the owner said yes" from them. They were missing, so they
    // arrived as undefined, and `t.plan_approved_at !== null` is TRUE for
    // undefined — every goal read back as plan_approved.
    // Row 141, second half: when the owner asks what is open, the one goal
    // STOPPED WAITING FOR HIM is the one that matters, and this could not say
    // so. Goal 3433 sat at stage waiting_on_user with a pending_question for
    // nearly a day; the assistant listed it as an ordinary open goal because
    // neither the question nor the wake date was in front of it.
    //
    // `next_wake_at` comes with it: „I come back to this tomorrow at 09:07" is
    // the difference between a goal that is running and a goal that is stalled,
    // and the owner cannot tell them apart from a title.
    `SELECT id, title, description, task_type, status, permission_granted,
            plan, plan_proposed, plan_approved_at, plan_version,
            created_at, last_activity_at, next_wake_at, pending_question
     FROM tasks t
     WHERE t.user_id = $1 AND ($2::text IS NULL OR t.status = $2)
       -- Row 258 (D466): a closed TEST goal the founder asked to stop seeing.
       -- Hidden from HIS list and from nowhere else — still readable by id,
       -- still carrying its asks, still whatever it is to every other account.
       -- Named one by one in "hidden_goals"; nothing here infers it.
       AND NOT EXISTS (SELECT 1 FROM hidden_goals h WHERE h.task_id = t.id)
     ORDER BY t.last_activity_at DESC
     LIMIT $3`,
    [userId, status ?? null, OPEN_TASKS_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Pause / resume / close / edit a task. Only the owner's task is touched.
 * Returns false when no such task exists for the user (nothing updated).
 */
/**
 * Ticket 20 row 147 — HOW a goal was closed, because the row could not say.
 *
 * finish_task and update_task(status='closed') both land here and wrote the
 * same row, so the stage expression tried to recover the difference by testing
 * whether the free-text note contained the English substring "stop". Every
 * closed goal was therefore SOLVED, including four of Tornike's closed on his
 * own word tonight with the note "closed on Tornike's request".
 *
 * 'finished' is the model calling finish_task — the result delivered or the
 * routes honestly exhausted. It is the best signal available and it is still
 * WEAKER than the seat's done-when, which asks for the owner to call it
 * resolved: nothing today puts that question to the owner at all.
 */
export type ClosedAs = 'finished' | 'stopped';

/**
 * A CLOSE MUST SAY WHICH KIND OF CLOSE IT WAS — enforced by the compiler, not
 * by remembering.
 *
 * The seat's 363, 20 September: „no goal has ever been recorded as solved",
 * measured as 59 closed goals on four accounts, every one `stopped`. The base
 * is kinder than their sample — two rows do read `finished` — but the shape
 * they found is real and the reason is here. Across every closed goal:
 *
 *   (null)    187      of which the biggest groups are hand-written admin
 *                      closes: „მომხმარებელმა დახურა" 28, „test goal —
 *                      closed on Tornike's account" 25, „battery test" 7
 *   stopped    79
 *   finished    2
 *
 * `closedAs` was optional, so a caller that simply did not think about it
 * wrote NULL, and NULL is indistinguishable from „we never asked". The column
 * that answers „how many of my goals actually worked" was two-thirds silence.
 *
 * 21 SEPTEMBER — THIS PARAGRAPH USED TO SAY THE PARAMETER HAD BEEN MADE
 * REQUIRED. IT HAD NOT. The signature below still reads `closedAs?`, and the
 * silence never stopped:
 *
 *     closed on   rows   with closed_as NULL
 *     16 Sep        39        38
 *     17 Sep        69        10
 *     18 Sep        48        35
 *     19 Sep        12         4
 *     20 Sep         1         1
 *
 * A comment describing a change nobody made is worse than no comment: the next
 * reader — me, five days later — takes it for the state of the code.
 *
 * WHAT IS ACTUALLY DONE NOW, and it is the smaller half of what that paragraph
 * promised. The write below COALESCEs to `'stopped'`, so a close can no longer
 * store nothing. Three callers pass a value already (`finish_task` twice with
 * `'finished'`, the stop path with `'stopped'`); the two that do not are both
 * the generic `update_task`, where the owner asked to close and claimed no
 * completion — and `'stopped'` is exactly what that is.
 *
 * WHAT IS STILL NOT DONE, said rather than implied: the parameter is still
 * optional, so the compiler still does not name a new path. Making it required
 * would force every `'open'` and `'paused'` caller to pass a value that means
 * nothing to them. The default removes the silence; it does not remove the
 * chance that somebody closes a goal without thinking about it. Those are
 * different guarantees and only the first one is in place.
 *
 * Old rows are untouched — 188 of them, and nothing can fix those: the
 * information was never captured.
 */
export async function updateTask(
  userId: string,
  taskId: number,
  status: TaskStatus,
  note?: string,
  closedAs?: ClosedAs,
): Promise<boolean> {
  const result = await query<{ thread_id: number | null }>(
    `UPDATE tasks
     SET status = $3,
         closed_reason = CASE WHEN $3 = 'closed' THEN $4 ELSE closed_reason END,
         -- COALESCE, not $5 alone: a close that names nothing is a close
         -- that was not a completion, and that is what 'stopped' means. NULL
         -- here is the value this column exists to stop storing.
         closed_as = CASE WHEN $3 = 'closed' THEN COALESCE($5::text, 'stopped') ELSE closed_as END,
         pending_question = CASE WHEN $3 = 'closed' THEN NULL ELSE pending_question END,
         pending_question_at = CASE WHEN $3 = 'closed' THEN NULL ELSE pending_question_at END,
         /*
          * Ticket 20 row 113, 17 September — a CLOSE USED TO ERASE THE WAKE,
          * and a goal closed by mistake could not be put back.
          *
          * The tester repaired the two goals tonight's P0 closed and found it:
          * „both came back with next_wake_at empty — so a reopened goal sits
          * there for ever unless somebody remembers to set the wake again." They
          * only knew the old times (20:48 and 15:51) because they happened to
          * have read them an hour before.
          *
          * The clearing was defensive and it was defending nothing. Ticket 11
          * Task 7 (e) was a REPORTING complaint — goal 1420 read „closed" with a
          * wake still showing — and every reader of this column filters on
          * status = 'open' already: getDueTasks, the nightly review's worklist,
          * ensureNextWake. A wake on a closed goal has never woken anything.
          *
          * So the date stays, the way it already stays through a pause, and
          * reopening a goal restores its schedule instead of silently leaving it
          * asleep. If a closed goal showing a wake reads oddly somewhere, that is
          * the display's question and it must not be answered by destroying the
          * only copy of the date.
          */
         next_wake_at = next_wake_at,
         updated_at = NOW(),
         last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING thread_id`,
    [taskId, userId, status, note ?? null, closedAs ?? null],
    QUERY_TIMEOUT_MS,
  );
  const updated = (result.rowCount ?? 0) > 0;
  // A closed goal's thread stops waiting for anyone — one of the tester's
  // flagged-badge cases was a CLOSED goal still shown as "needs you"
  // (ticket 8 task 2b). Every close route lands here, so the badge follows.
  const threadId = result.rows[0]?.thread_id;
  /**
   * Ticket 20 row 113, test 5 — a PAUSED goal's chat read „working".
   *
   * The tester opened one fresh: the header said the goal was working and
   * offered the stop button. Pausing a goal changed the row and left the
   * thread exactly as it was, because only a CLOSE ever touched the thread's
   * status. So the screen said the opposite of the truth in one direction, and
   * on a page held open across the pause it offered no button at all — out of
   * step both ways.
   *
   * „waiting" rather than „done": a paused goal is not finished, it is
   * stopped-for-now and the owner is the one who resumes it.
   */
  if (updated && status === 'paused' && threadId != null) {
    // The owner's own language. On their screen since 20 September — the
    // client used to draw a generic label and throw this away.
    void userLanguage(userId)
      .catch(() => 'ka' as RunLanguage)
      .then((language) =>
        setThreadStatus(userId, threadId, 'waiting', {
          isTask: true,
          statusLine: RUN_STRINGS[language].goalPaused,
        }),
      )
      .catch(() => undefined);
  }
  if (updated && status === 'closed' && threadId != null) {
    /**
     * Ticket 20 row 113, fifth pass — the TYPED stop must abort the run too.
     *
     * b6cc2b6 made the button stop the work. The typed line does not go
     * through that route at all: the model closes the goal itself, from inside
     * the run, and the run then carried on. Read by the tester on goal 4555 /
     * thread 16699:
     *
     *   13:48:49  the owner typed stop; 4555 closed at 13:48:55
     *   13:50:02  the same run called create_task and opened goal 4588
     *   13:50:23  and posted 4588's plan
     *
     * So a stop produced a NEW goal, on the same thread, with the same title —
     * the one outcome worse than not stopping. The header button finally
     * closed 4588 at 13:52:11, and only because it takes the other route.
     *
     * Every close in this codebase lands in this function, which makes it the
     * one place the two paths cannot drift apart. Only a STOP marks the
     * thread: `finished` is a run delivering its result, and marking that
     * would throw away the answer the owner was waiting for.
     */
    if (closedAs === 'stopped') markThreadStopped(threadId);
    void setThreadStatus(userId, threadId, 'done', { isTask: true });
  }
  // Ticket 13 Task 42 (7): a goal closed before any question went out was
  // DROPPED — the outcome ladder's evidence for pressure_response.
  if (updated && status === 'closed') {
    void recordDroppedIfNeverAsked(userId, taskId);
  }
  return updated;
}

async function recordDroppedIfNeverAsked(userId: string, taskId: number): Promise<void> {
  try {
    const asked = await query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM task_asks WHERE task_id = $1',
      [taskId],
      QUERY_TIMEOUT_MS,
    );
    if (Number(asked.rows[0]?.n ?? 0) === 0) {
      const { recordTaskOutcome } = await import('./partH.service');
      await recordTaskOutcome(userId, taskId, 'dropped');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[task-store] dropped outcome for task ${taskId} failed:`,
      (err as Error).message,
    );
  }
}

/** Record the one blanket "ok to ask around" consent for a task. */
export async function grantTaskPermission(userId: string, taskId: number): Promise<boolean> {
  const result = await query(
    `UPDATE tasks
     SET permission_granted = true, updated_at = NOW(), last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [taskId, userId],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * ROW 258 (D466) — take a CLOSED goal out of its owner's own list.
 *
 * The founder chose this over D450's stop-and-remove, which would have sent
 * „no longer needed" to three real people who had already been asked. Not
 * deleted, not closed, not stopped: not listed.
 *
 * REFUSES AN OPEN GOAL, and that is the seat's own check made impossible to
 * fail rather than merely tested: their done-when is that the open-goal count
 * does not move, so an open goal cannot be hidden at all.
 *
 * Returns what happened rather than a boolean, because „that goal is open" and
 * „there is no such goal" are different answers and a caller hiding a list of
 * ids needs to know which it got.
 */
export type HideOutcome = 'hidden' | 'already_hidden' | 'refused_open' | 'no_such_goal';

/**
 * ROW 258 (D466) — take CLOSED goals out of their owner's own list.
 *
 * The founder chose this over D450's stop-and-remove, which would have sent
 * „no longer needed" to three real people who had already been asked. Not
 * deleted, not closed, not stopped: not listed.
 *
 * REFUSES AN OPEN GOAL, and that is the seat's own check made impossible to
 * fail rather than merely tested: their done-when is that the open-goal count
 * does not move, so an open goal cannot be hidden at all.
 *
 * TWO QUERIES FOR ANY NUMBER OF IDS, AND THAT IS NOT PREMATURE TUNING — IT IS
 * A BUG I SHIPPED AND HIT WITHIN THE HOUR. The first version looped, two
 * round trips per goal. Pointed at the real list of 221 it made 442 of them,
 * the gateway cut the connection at 127, and the caller got no answer at all
 * about what had happened. The work was recoverable only because the insert is
 * `ON CONFLICT DO NOTHING` and I could read the table afterwards.
 *
 * The per-id answers survive the change: a status read tells `no_such_goal`
 * from `refused_open`, and `RETURNING` tells a row this call inserted from one
 * that was already there.
 */
export async function hideGoals(
  taskIds: readonly number[],
  hiddenBy: string,
  reason: string,
): Promise<Map<number, HideOutcome>> {
  const why = reason.trim();
  if (why === '') throw new Error('a hidden goal needs a reason');
  const outcome = new Map<number, HideOutcome>();
  const wanted = [...new Set(taskIds)];
  if (wanted.length === 0) return outcome;

  const known = await query<{ id: number; status: string }>(
    `SELECT id, status FROM tasks WHERE id = ANY($1::int[])`,
    [wanted],
    QUERY_TIMEOUT_MS,
  );
  const status = new Map(known.rows.map((r) => [r.id, r.status]));
  const closed: number[] = [];
  for (const id of wanted) {
    const state = status.get(id);
    if (state === undefined) outcome.set(id, 'no_such_goal');
    else if (state !== 'closed') outcome.set(id, 'refused_open');
    else closed.push(id);
  }
  if (closed.length === 0) return outcome;

  const inserted = await query<{ task_id: number }>(
    `INSERT INTO hidden_goals (task_id, hidden_by, reason)
     SELECT id, $2, $3 FROM unnest($1::int[]) AS id
     ON CONFLICT (task_id) DO NOTHING
     RETURNING task_id`,
    [closed, hiddenBy, why],
    QUERY_TIMEOUT_MS,
  );
  const fresh = new Set(inserted.rows.map((r) => r.task_id));
  for (const id of closed) outcome.set(id, fresh.has(id) ? 'hidden' : 'already_hidden');
  return outcome;
}

/** One goal, for a caller with one. */
export async function hideGoal(
  taskId: number,
  hiddenBy: string,
  reason: string,
): Promise<HideOutcome> {
  return (await hideGoals([taskId], hiddenBy, reason)).get(taskId) ?? 'no_such_goal';
}

/** The undo, and it is a plain delete: the goal returns to the list unchanged. */
export async function unhideGoal(taskId: number): Promise<boolean> {
  const done = await query(
    `DELETE FROM hidden_goals WHERE task_id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return (done.rowCount ?? 0) > 0;
}

/** What is hidden, for a person who wants to see what they stopped seeing. */
export async function hiddenGoals(
  userId: string,
): Promise<Array<{ task_id: number; title: string | null; reason: string }>> {
  const result = await query<{ task_id: number; title: string | null; reason: string }>(
    `SELECT h.task_id, t.title, h.reason
       FROM hidden_goals h
       JOIN tasks t ON t.id = h.task_id
      WHERE t.user_id = $1
      ORDER BY h.task_id`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * ROW 238 (D119) — the owner has asked for a change, so the automatic next
 * wave waits for their new yes.
 *
 * NOT A REVOCATION, and the founder's own sentence is why: „a change to the
 * plan needs a new yes, AND THE UNCHANGED PARTS KEEP RUNNING MEANWHILE". A
 * blanket clear of `plan_approved_at` keeps the first half and breaks the
 * second. So the plan stays approved, what is in flight stays in flight, and
 * only the wakes that would START a new wave stand down.
 *
 * ONLY WHILE A PLAN IS ACTUALLY IN FORCE. A goal with no approved plan has no
 * standing permission to pause, and stamping one would give the sweepers a
 * reason to skip a goal that was never running.
 *
 * Returns the goal it stamped, so the caller can say so in the log rather than
 * guess whether anything happened.
 */
export async function notePlanChangeRequested(threadId: number): Promise<number | null> {
  const result = await query<{ id: number }>(
    `UPDATE tasks
        SET plan_change_requested_at = NOW()
      WHERE thread_id = $1
        AND status = 'open'
        AND plan_approved_at IS NOT NULL
        AND plan_change_requested_at IS NULL
      RETURNING id`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.id ?? null;
}

/** Their new yes, or a fresh go-ahead: the wave may start again. */
export async function clearPlanChangeRequest(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET plan_change_requested_at = NULL WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
}
