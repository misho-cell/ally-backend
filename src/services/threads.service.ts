import { query } from '../db/postgres/client';
import { geoName } from './georgianCase';
import {
  stripAllowedSpans,
  stripEmDashesForDisplay,
  stripRedactionArtifactsForDisplay,
} from './privacyScrub';

export type ThreadStatus = 'working' | 'waiting' | 'needs_you' | 'done' | 'failed';

// Default status_line per status (Georgian, shown under the thread title in the
// chat list). `done` carries no line — an idle thread needs no caption.
export const STATUS_LINES: Readonly<Record<ThreadStatus, string | null>> = {
  working: 'ვმუშაობ…',
  waiting: 'ველოდები პასუხს',
  needs_you: 'შენი პასუხი სჭირდება',
  done: null,
  failed: 'შეფერხდა — სცადე თავიდან',
};

export interface Thread {
  id: number;
  user_id: number;
  type: 'regular' | 'incoming_request' | 'outgoing_request' | 'incoming_ask' | 'campaign_invite';
  title: string | null;
  introduction_request_id: number | null;
  is_task: boolean;
  status: ThreadStatus;
  status_line: string | null;
  created_at: string;
  updated_at: string;
}

// Initial task state for a thread created in a non-idle state (request threads).
export interface ThreadTaskState {
  isTask: boolean;
  status: ThreadStatus;
  statusLine: string | null;
}

export interface ThreadMessage {
  /**
   * Needed by the client as the "load older" cursor, with created_at.
   * A UUID string on production (migration 002) — never assume numeric.
   */
  id: string;
  role: string;
  content: string;
  kind: string;
  run_id: string | null;
  created_at: string;
  /** Tappable options saved with the message (present_choices) — render as buttons. */
  choices: string[] | null;
  /**
   * Which prompt answered this turn (ticket 9 task 34): the run's mode, and
   * `name@ISO` per block it loaded. Null on a message whose run predates the
   * stamp link, and on user messages.
   */
  prompt_mode?: string | null;
  prompt_blocks?: string[] | null;
}

interface ThreadRow extends Thread {
  last_message: string | null;
  last_message_at: string | null;
  // Public ref of the linked introduction request (null on regular threads) —
  // what the client posts to /requests/:ref/{accept,decline,snooze}.
  request_ref: string | null;
}

// The list shows a one-line preview, so the full text of the last message has
// no business travelling: the founder's account carries 1623 threads, and
// sending every last reply in full made the payload grow with every long
// answer the assistant ever wrote. Truncated in SQL, before it leaves Postgres.
const LAST_MESSAGE_PREVIEW_CHARS = 200;
// Ceiling for a client-supplied page size.
const MAX_THREAD_PAGE = 200;

export interface ThreadListOptions {
  /** Page size. Omitted = every thread (the pre-pagination behaviour). */
  readonly limit?: number;
  /** Cursor: return threads older than this updated_at (with beforeId to break ties). */
  readonly beforeUpdatedAt?: string;
  readonly beforeId?: number;
}

// The list's columns, shared by the page query and the open-goals query so the
// two can never drift into returning differently-shaped rows.
const THREAD_LIST_COLUMNS = `t.id,
       t.user_id,
       t.type,
       t.title,
       t.introduction_request_id,
       t.is_task,
       t.status,
       t.status_line,
       t.created_at,
       t.updated_at,
       ir.request_ref,
       LEFT(lm.content, ${LAST_MESSAGE_PREVIEW_CHARS}) AS last_message,
       lm.created_at AS last_message_at`;

const THREAD_LIST_JOINS = `FROM threads t
     LEFT JOIN introduction_requests ir ON ir.id = t.introduction_request_id
     LEFT JOIN LATERAL (
       SELECT content, created_at
       FROM conversations
       WHERE thread_id = t.id AND content != ''
       ORDER BY created_at DESC
       LIMIT 1
     ) lm ON true`;

/** A thread that carries a goal the user has not closed. */
const HAS_OPEN_GOAL = `EXISTS (SELECT 1 FROM tasks k WHERE k.thread_id = t.id AND k.status = 'open')`;

// How many open goals page one lifts above the conversations. Not a limit on
// how many a user may have: anything past this is reachable through ordinary
// paging (see promotedGoalThreadIds). The most any user carries today is 7.
const MAX_GOAL_THREADS = 50;

/**
 * The sidebar: open goals first, then conversations by recency (ticket 9 task
 * 20 c).
 *
 * The client asks for `?limit=30`, and a goal thread used to compete for those
 * thirty places on last-touched date like any chat. A goal is not a chat: it is
 * a standing piece of work that can sit for a week without a wake and still be
 * the most important row on the screen — thread 8614 was already down at rank
 * 26 and drifting, one busy week from falling off the first page of its owner's
 * sidebar while its goal was still open.
 *
 * So the goals do not compete: they are fetched separately and ride at the top,
 * ALL of them, regardless of age, and the page query never returns them again.
 * The first page is therefore up to `limit` conversations PLUS the open goals —
 * a client that asked for thirty may receive a few more rows, and that is the
 * intended trade.
 *
 * Paging excludes exactly the goal threads page one PROMOTED — by their ids,
 * not by "has an open goal". The difference is the 51st goal: excluding the
 * predicate hid it on every page at once, because page one had already cut the
 * list at MAX_GOAL_THREADS and every later page then filtered goals out again.
 * Excluding the ids instead leaves anything past the cap to reach the reader
 * the ordinary way, in date order.
 */
export async function getThreadsForUser(
  userId: string,
  opts: ThreadListOptions = {},
): Promise<ThreadRow[]> {
  const limit =
    opts.limit === undefined ? null : Math.min(Math.max(1, opts.limit), MAX_THREAD_PAGE);
  const before = opts.beforeUpdatedAt ?? null;
  // Tie-break so a page boundary landing between two threads with the same
  // updated_at can neither skip nor repeat one.
  const beforeId = opts.beforeId ?? Number.MAX_SAFE_INTEGER;
  // The same promoted set on every page, recomputed rather than carried in the
  // cursor: the client sends a date and an id, and adding a list of ids to the
  // cursor contract to fix a server-side rule is the wrong trade.
  const promoted = await promotedGoalThreadIds(userId);
  const result = await query<ThreadRow>(
    `SELECT
       ${THREAD_LIST_COLUMNS}
     ${THREAD_LIST_JOINS}
     WHERE t.user_id = $1
       AND ($2::timestamptz IS NULL OR (t.updated_at, t.id) < ($2::timestamptz, $3::bigint))
       AND NOT (t.id = ANY($5::bigint[]))
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT $4::int`,
    [userId, before, beforeId, limit, promoted],
  );
  if (before !== null || promoted.length === 0) return result.rows;
  const goals = await query<ThreadRow>(
    `SELECT
       ${THREAD_LIST_COLUMNS}
     ${THREAD_LIST_JOINS}
     WHERE t.id = ANY($1::bigint[])
     ORDER BY t.updated_at DESC, t.id DESC`,
    [promoted],
  );
  return [...goals.rows, ...result.rows];
}

/**
 * The open-goal threads page one lifts to the top, newest first, capped.
 *
 * The cap exists so one user's goals cannot swallow a page; the ids are
 * returned so the cap cannot also make the goals past it disappear.
 */
async function promotedGoalThreadIds(userId: string): Promise<number[]> {
  const result = await query<{ id: string }>(
    `SELECT t.id
     FROM threads t
     WHERE t.user_id = $1
       AND ${HAS_OPEN_GOAL}
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT $2::int`,
    [userId, MAX_GOAL_THREADS],
  );
  return result.rows.map((r) => Number(r.id));
}

// A brand-new thread is never born titleless: a null title left the row blank
// in the client with no rename/delete controls at all — an unremovable ghost
// (ticket 6 B2, threads 9080/9115). The first message replaces this.
export const DEFAULT_NEW_THREAD_TITLE = 'ახალი საუბარი';

export async function createThread(
  userId: string,
  type: Thread['type'],
  title?: string,
  introRequestId?: number,
  task?: ThreadTaskState,
): Promise<Thread> {
  const result = await query<Thread>(
    `INSERT INTO threads (user_id, type, title, introduction_request_id, is_task, status, status_line)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, type, title, introduction_request_id, is_task, status, status_line,
               created_at, updated_at`,
    [
      userId,
      type,
      title ?? (type === 'regular' ? DEFAULT_NEW_THREAD_TITLE : null),
      introRequestId ?? null,
      task?.isTask ?? false,
      task?.status ?? 'done',
      task?.statusLine ?? null,
    ],
  );
  return result.rows[0];
}

export async function getThread(threadId: number, userId: string): Promise<Thread | null> {
  const result = await query<Thread>(
    `SELECT id, user_id, type, title, introduction_request_id, is_task, status, status_line,
            created_at, updated_at
     FROM threads
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [threadId, userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Delete ONE conversation — Lika's item D23, the narrow sibling of account
 * erasure, and the same promise the Privacy Policy already makes. Everything
 * in one transaction: the thread's messages, its run stamps, and the thread
 * row. A task living on the thread is cancelled first (its pending asks are
 * cancelled by the caller BEFORE this, since notifying recipients is a
 * side-effect that must not ride inside the transaction).
 */
export async function deleteThread(
  userId: string,
  threadId: number,
): Promise<{ deleted: boolean; cancelledTasks: number[] }> {
  const { withTransaction } = await import('../db/postgres/client');
  return withTransaction(async (client) => {
    const owned = await client.query<{ id: number }>(
      'SELECT id FROM threads WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [threadId, userId],
    );
    if (owned.rows.length === 0) return { deleted: false, cancelledTasks: [] };
    // tasks.user_id is TEXT (migration 040) — the parameter stays UNCAST so PG
    // infers the type from the column; and the status CHECK allows only
    // open/paused/closed, so a deleted thread's task is 'closed' with a reason.
    // Both wrong in the first cut: DELETE /threads returned 500 on every real
    // thread (ticket 5 item A2).
    const tasks = await client.query<{ id: number }>(
      `UPDATE tasks SET status = 'closed', closed_reason = 'thread_deleted'
       WHERE thread_id = $1 AND user_id = $2 AND status = 'open'
       RETURNING id`,
      [threadId, userId],
    );
    await client.query('DELETE FROM conversations WHERE thread_id = $1', [threadId]);
    await client.query('DELETE FROM run_prompt_stamps WHERE thread_id = $1', [threadId]);
    await client.query('DELETE FROM threads WHERE id = $1', [threadId]);
    return { deleted: true, cancelledTasks: tasks.rows.map((t) => t.id) };
  });
}

export async function getThreadByIntroRequestId(introRequestId: number): Promise<Thread | null> {
  const result = await query<Thread>(
    `SELECT id, user_id, type, title, introduction_request_id, is_task, status, status_line,
            created_at, updated_at
     FROM threads
     WHERE introduction_request_id = $1
     LIMIT 1`,
    [introRequestId],
  );
  return result.rows[0] ?? null;
}

/** Both sides of an introduction request: the mediator's incoming thread and the requester's outgoing one. */
export async function getThreadsByIntroRequestId(introRequestId: number): Promise<Thread[]> {
  const result = await query<Thread>(
    `SELECT id, user_id, type, title, introduction_request_id, is_task, status, status_line,
            created_at, updated_at
     FROM threads
     WHERE introduction_request_id = $1`,
    [introRequestId],
  );
  return result.rows;
}

export async function updateThreadTitle(threadId: number, title: string): Promise<void> {
  await query(`UPDATE threads SET title = $1, updated_at = NOW() WHERE id = $2`, [title, threadId]);
}

/**
 * Persist the thread's task state. `isTask` only ever flips to true (a thread
 * that became a task stays one); omitting it leaves the flag unchanged.
 */
export async function updateThreadStatus(
  threadId: number,
  status: ThreadStatus,
  statusLine: string | null,
  isTask?: boolean,
): Promise<void> {
  await query(
    `UPDATE threads
     SET status = $1, status_line = $2, is_task = COALESCE($3, is_task), updated_at = NOW()
     WHERE id = $4`,
    [status, statusLine, isTask ?? null, threadId],
  );
}

export async function touchThread(threadId: number): Promise<void> {
  await query(`UPDATE threads SET updated_at = NOW() WHERE id = $1`, [threadId]);
}

export async function getOrCreateDefaultThread(userId: string): Promise<number> {
  const result = await query<{ id: number }>(
    `SELECT id FROM threads
     WHERE user_id = $1 AND type = 'regular'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length > 0) {
    return result.rows[0].id;
  }

  const created = await createThread(userId, 'regular', 'Netai Chat');
  return created.id;
}

export interface ThreadMessageOptions {
  readonly includeSteps?: boolean;
  /** Page size, counted from the NEWEST message back. Omitted = whole history. */
  readonly limit?: number;
  /** Cursor for "load older": messages before this (created_at, id). */
  readonly beforeCreatedAt?: string;
  /** The row id at the cursor — a UUID string on prod, so never parsed as a number. */
  readonly beforeId?: string;
}

// Ceiling for a client-supplied page size.
const MAX_MESSAGE_PAGE = 200;

/**
 * A thread's messages, oldest-first within the page.
 *
 * Paging counts back from the NEWEST message because a chat opens at the
 * bottom: `limit` returns the most recent N, and the client walks upwards by
 * passing the oldest row it holds as the cursor. Without it the endpoint sent
 * every message a thread had ever accumulated — the founder's long threads run
 * to hundreds of turns, and opening one meant shipping and rendering all of
 * them (the 4–5s page switch, 12 Aug).
 */
export async function getThreadMessages(
  threadId: number,
  opts: ThreadMessageOptions = {},
): Promise<ThreadMessage[]> {
  // Step rows are live-run narration (kept in the DB as timeout-salvage
  // material) — in the chat view they read as the assistant saying almost the
  // same thing twice (ticket 3 §6.2: a step at 07:49:11 and the final message
  // at 07:49:20 in thread 7921). 'event' rows are engine turns written FOR THE
  // MODEL — tags, tool instructions and all (ticket 4 item 0C.2). Neither
  // belongs in a chat; the admin window keeps both for word-for-word
  // inspection.
  const kindFilter = opts.includeSteps ? '' : ` AND kind NOT IN ('step', 'event')`;
  const limit =
    opts.limit === undefined ? null : Math.min(Math.max(1, opts.limit), MAX_MESSAGE_PAGE);
  // The cursor clause is BUILT, not NULL-tricked: conversations.id is a UUID
  // on production (migration 002) while test schemas use serial — comparing it
  // against a typed numeric placeholder fails at PARSE time even when the
  // cursor is absent, which is how a bare ?limit=30 broke every chat on prod
  // (12 Aug). id::text on both sides orders identically to the ORDER BY below
  // in every schema, which is all a tie-break needs.
  const params: unknown[] = [threadId];
  let cursorClause = '';
  if (opts.beforeCreatedAt && opts.beforeId) {
    params.push(opts.beforeCreatedAt, opts.beforeId);
    cursorClause = ` AND (created_at, id::text) < ($2::timestamptz, $3::text)`;
  } else if (opts.beforeCreatedAt) {
    params.push(opts.beforeCreatedAt);
    cursorClause = ` AND created_at < $2::timestamptz`;
  }
  params.push(limit);
  const limitIdx = params.length;
  // The inner scan walks the (thread_id, created_at DESC) index backwards from
  // the newest row and stops at LIMIT; the outer flip restores reading order.
  // Each message carries the prompt that produced it (ticket 9 task 34): the
  // run's mode and the exact block revisions it loaded, joined from the stamp
  // the run wrote. Four goal conversations on 2 September showed none of the
  // goal rules and nothing in the product could say which block had spoken —
  // `run_id` was null on every message and nothing read the stamps back. A
  // LEFT JOIN, so a message from before the link existed still renders.
  const result = await query<ThreadMessage>(
    `SELECT page.*, s.mode AS prompt_mode, s.block_versions AS prompt_blocks
     FROM (
       SELECT id, role, content, kind, run_id, created_at, choices
       FROM conversations
       WHERE thread_id = $1 AND content != ''${kindFilter}${cursorClause}
       ORDER BY created_at DESC, id::text DESC
       LIMIT $${limitIdx}::int
     ) page
     LEFT JOIN run_prompt_stamps s ON s.run_id = page.run_id
     ORDER BY page.created_at ASC, page.id::text ASC`,
    params,
  );
  // Reveal own-number passthrough spans at this display boundary (stored text
  // keeps the markers so repeated scrub passes stay idempotent). Em dashes are
  // stripped from the ASSISTANT's prose only (brand rule, render-layer fix).
  return result.rows.map((row) => ({
    ...row,
    content:
      row.role === 'assistant'
        ? stripEmDashesForDisplay(stripRedactionArtifactsForDisplay(stripAllowedSpans(row.content)))
        : stripAllowedSpans(row.content),
  }));
}

/**
 * The longest narration step a run persisted — the material for a partial
 * answer when the run itself never finished (hard timeout). Steps are stored
 * already scrubbed.
 */
export async function getLongestRunStep(threadId: number, runId: string): Promise<string | null> {
  const result = await query<{ content: string }>(
    `SELECT content FROM conversations
     WHERE thread_id = $1 AND run_id = $2 AND kind = 'step' AND content != ''
     ORDER BY length(content) DESC
     LIMIT 1`,
    [threadId, runId],
  );
  return result.rows[0]?.content ?? null;
}

export async function saveThreadMessage(
  threadId: number,
  userId: number,
  role: 'user' | 'assistant',
  content: string,
  // 'error' renders as a system-styled failure with a retry in the client —
  // never as words the assistant said.
  kind: 'message' | 'error' = 'message',
): Promise<void> {
  await query(
    `INSERT INTO conversations (thread_id, user_id, role, content, content_json, kind)
     VALUES ($1, $2, $3, $4, NULL, $5)`,
    [threadId, userId, role, content, kind],
  );
  await touchThread(threadId);
}

export async function createIncomingRequestThread(
  mediatorUserId: number,
  introRequestId: number,
  requesterName: string,
  targetName: string,
  message: string | null,
  // Direct case (task 18): the reader IS the target — "X wants to meet you",
  // never "X wants you to introduce them to yourself" (live row #793).
  direct = false,
): Promise<Thread> {
  const title = direct ? `${requesterName} → შენ` : `${requesterName} → ${targetName}`;
  // The mediator must answer this request — the thread is born a task awaiting them.
  const thread = await createThread(
    String(mediatorUserId),
    'incoming_request',
    title,
    introRequestId,
    {
      isTask: true,
      status: 'needs_you',
      statusLine: STATUS_LINES.needs_you,
    },
  );

  const openingMessage = direct
    ? `გამარჯობა! **${geoName(requesterName, 'dat')}** შენი გაცნობა უნდა.` +
      (message ? `\n\nმისი შეტყობინება: _"${message}"_` : '') +
      `\n\nდათანხმდები?`
    : `გამარჯობა! **${requesterName}** გთხოვს, გააცნო **${geoName(targetName, 'dat')}**.` +
      (message ? `\n\nმისი შეტყობინება: _"${message}"_` : '') +
      `\n\nდაეხმარები? 🤝`;

  await saveThreadMessage(thread.id, mediatorUserId, 'assistant', openingMessage);

  return thread;
}

export async function createOutgoingRequestThread(
  requesterUserId: number,
  introRequestId: number,
  mediatorName: string,
  targetName: string,
  direct = false,
): Promise<Thread> {
  const title = direct ? `გაცნობა: ${targetName}` : `${mediatorName} → ${targetName}`;
  // The requester is waiting on the mediator — born a task in the waiting state.
  const thread = await createThread(
    String(requesterUserId),
    'outgoing_request',
    title,
    introRequestId,
    {
      isTask: true,
      status: 'waiting',
      statusLine: STATUS_LINES.waiting,
    },
  );

  const openingMessage = direct
    ? `**${geoName(targetName, 'dat')}** გაეგზავნა შენი გაცნობის თხოვნა.\n\n` +
      `Netai-ს გახსნისას ნახავს და გიპასუხებს. 😊`
    : `**${geoName(mediatorName, 'gen')}თვის** გაიგზავნა გაცნობის მოთხოვნა **${geoName(targetName, 'on')}**.\n\n` +
      `**${mediatorName}** Netai-ს შემდეგ გახსნისას ნახავს და გიპასუხებს. 😊`;

  await saveThreadMessage(thread.id, requesterUserId, 'assistant', openingMessage);

  return thread;
}

interface ThreadContextMessage {
  role: string;
  content: string;
  created_at: string;
}

interface ThreadContext {
  id: number;
  type: string;
  title: string | null;
  messages: ThreadContextMessage[];
}

export async function getThreadContext(userId: string): Promise<object> {
  const threadsResult = await query<{ id: number; type: string; title: string | null }>(
    `SELECT id, type, title
     FROM threads
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 20`,
    [userId],
  );

  const threads: ThreadContext[] = [];

  for (const row of threadsResult.rows) {
    const msgsResult = await query<ThreadContextMessage>(
      `SELECT role, content, created_at
       FROM conversations
       WHERE thread_id = $1 AND content != ''
       ORDER BY created_at DESC
       LIMIT 5`,
      [row.id],
    );

    threads.push({
      id: row.id,
      type: row.type,
      title: row.title,
      messages: msgsResult.rows.reverse(),
    });
  }

  return { threads };
}
