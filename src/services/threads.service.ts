import { query } from '../db/postgres/client';
import {
  languageOfConversation,
  NEW_THREAD_TITLE,
  RunLanguage,
  RUN_STRINGS,
  STOPPED_STATUS_LINE,
} from './runLanguage';
import {
  incomingRequestOpening,
  incomingRequestTitle,
  outgoingRequestOpening,
  outgoingRequestTitle,
} from './introOpening';
import {
  scrubMechanicalForStorage,
  stripAllowedSpans,
  stripEmDashesForDisplay,
  stripRedactionArtifactsForDisplay,
} from './privacyScrub';

export type ThreadStatus = 'working' | 'waiting' | 'needs_you' | 'done' | 'failed';

/**
 * The Georgian caption per status, shown under the thread title in the chat
 * list. `done` carries no line — an idle thread needs no caption.
 *
 * NO LONGER THE DEFAULT. It was, and the seat measured what that cost on
 * Test 1 — thirteen threads, not one Georgian character in anything the owner
 * ever wrote, six of them captioned „ველოდები პასუხს" (their 332). Every
 * caller of `setThreadStatus` that named no line took this constant, which has
 * no language input at all. `defaultStatusLine` in threadStatus.service asks
 * the owner instead.
 *
 * The two INTRODUCTION threads were the last callers, and they were left here
 * for a day because their title and their opening message were hard-coded
 * Georgian too — a translated caption above an untranslated message reads
 * worse than neither. Both are in the reader's own language now
 * (`introOpening.ts`), so nothing writes from this constant any more. It is
 * kept as the Georgian column of the four: `RUN_STRINGS.ka.statusLines`.
 */
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
   * Ticket 20 row 132 — which model wrote this text.
   *
   * Null for every row written before the column existed and for every message
   * that is not a model's answer: „nobody recorded it", not „Claude wrote it".
   */
  answered_by: string | null;
  /**
   * Ticket 17 Task 39: the ready-to-send invitation, when this turn produced
   * one. Stored with the row so it survives a reload — the SSE event that
   * first carried it is gone by then, and the share button would otherwise
   * fall back to a bare URL. Null on every other message.
   */
  share_text: string | null;
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
  /** Row 207: this thread's goal was stopped by its owner — see GOAL_WAS_STOPPED. */
  goal_stopped?: boolean;
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

/** A thread that carries a goal the user has not closed. */
const HAS_OPEN_GOAL = `EXISTS (SELECT 1 FROM tasks k WHERE k.thread_id = t.id AND k.status = 'open')`;

/**
 * A thread whose goal is open is never shown as finished, whatever its own
 * row says.
 *
 * The seat's read of 3fdcfe9: goal 3763 — the founder's real volleyball goal,
 * status open, stage running, next wake 18 September — sat under „finished"
 * in his sidebar, and its chat header said the same. The goal was fine. The
 * SCREEN was reading the THREAD's state, and the thread's state is written at
 * the end of a run.
 *
 * I fixed the writer earlier tonight: a run that ends on a thread with an open
 * goal now stores „waiting" instead of „done". That is forward-only. It does
 * nothing for 3763, whose last run ended before the fix and which will not run
 * again until its wake — so the founder would have gone on reading „finished"
 * on live work for another day.
 *
 * So the READER refuses it too. Correcting the stored rows would be a write
 * across live data and somebody's decision to authorise; deriving the answer
 * at read time needs nobody, fixes every existing thread at once, and the two
 * agree from here on.
 *
 * The caption is dropped rather than translated: `done` carries none anyway,
 * and a stale „შეფერხდა — სცადე თავიდან" under a running goal would be the
 * same lie in smaller type. The client's own word for the group is what shows.
 */
/**
 * And the mirror, which is the bigger half — the seat's #4424.
 *
 * Read off his own sidebar at 00:43 against the admin, side by side. Under
 * „ongoing", five rows: 3433 open and correct, and then 5051, 4822 and 4819 —
 * all CLOSED, all stopped by their owner — plus 16840, which never had a goal
 * at all. The header above the list said „working on your 2 goals", which was
 * right. The list under it showed five.
 *
 * What the wrong rows have in common is the „could not be done" state. Their
 * goals are closed, several of them stopped deliberately, and the thread kept
 * a failure from a run that is now irrelevant and went on advertising itself
 * as live work.
 *
 * So: a thread whose goal is CLOSED is finished, whatever its last run did.
 * If the owner stopped it, the thread has nothing left to say.
 *
 * TWO CASES DELIBERATELY LEFT ALONE. A thread that is 'working' is working —
 * a run in flight on a thread whose old goal is closed is still a run, and
 * calling it finished would put the spinner back in the state row 113 spent a
 * day on. And a FAILED thread with NO GOAL EVER (16840 is theirs) stays where
 * it is: that is a genuine run failure the owner may want to retry, and
 * hiding it would hide real breakage. How long a failure should stay visible
 * is a product question, not something to invent at five in the morning — it
 * is written to the morning list instead.
 */
const HAS_A_GOAL = `EXISTS (SELECT 1 FROM tasks k WHERE k.thread_id = t.id)`;
/**
 * This thread's goal was STOPPED by its owner, as the goal record says rather
 * than as the thread remembers.
 *
 * The caption written at the moment of the stop does not survive. Every later
 * `setThreadStatus(..., 'done')` that passes no line takes `STATUS_LINES.done`,
 * which is null, and erases it — so the thread of a stopped goal reads
 * „finished", with nothing under it, as soon as anything touches it again.
 *
 * Measured on account 501: of seventy goals closed with `closed_as = 'stopped'`,
 * thirty-seven have no caption left and thirty-three do, and the split is not a
 * deploy or a second code path — `goalStop` is the only writer of that value.
 * It is which threads were touched afterwards.
 *
 * So the caption is derived, the same way the status above it already is, and
 * for the same reason: correcting the stored rows would be a write across live
 * data and somebody's decision to authorise, while deriving it at read time
 * needs nobody and fixes every thread at once.
 */
const GOAL_WAS_STOPPED = `EXISTS (
       SELECT 1 FROM tasks k
        WHERE k.thread_id = t.id AND k.status = 'closed' AND k.closed_as = 'stopped'
     )`;
const GOAL_IS_FINISHED = `(${HAS_A_GOAL} AND NOT ${HAS_OPEN_GOAL})`;

const STATUS_HONEST_ABOUT_OPEN_GOALS = `CASE
       WHEN t.status IN ('done', 'failed') AND ${HAS_OPEN_GOAL} THEN 'waiting'
       WHEN t.status IN ('waiting', 'needs_you', 'failed') AND ${GOAL_IS_FINISHED} THEN 'done'
       ELSE t.status
     END`;
const STATUS_LINE_HONEST_ABOUT_OPEN_GOALS = `CASE
       WHEN t.status IN ('done', 'failed') AND ${HAS_OPEN_GOAL} THEN NULL
       WHEN t.status IN ('waiting', 'needs_you', 'failed') AND ${GOAL_IS_FINISHED} THEN NULL
       ELSE t.status_line
     END`;

// The list's columns, shared by the page query and the open-goals query so the
// two can never drift into returning differently-shaped rows.
const THREAD_LIST_COLUMNS = `t.id,
       t.user_id,
       t.type,
       t.title,
       t.introduction_request_id,
       t.is_task,
       ${STATUS_HONEST_ABOUT_OPEN_GOALS} AS status,
       ${STATUS_LINE_HONEST_ABOUT_OPEN_GOALS} AS status_line,
       t.created_at,
       t.updated_at,
       ir.request_ref,
       LEFT(lm.content, ${LAST_MESSAGE_PREVIEW_CHARS}) AS last_message,
       lm.created_at AS last_message_at,
       ${GOAL_WAS_STOPPED} AS goal_stopped`;

const THREAD_LIST_JOINS = `FROM threads t
     LEFT JOIN introduction_requests ir ON ir.id = t.introduction_request_id
     LEFT JOIN LATERAL (
       SELECT content, created_at
       FROM conversations
       WHERE thread_id = t.id AND content != ''
       ORDER BY created_at DESC
       LIMIT 1
     ) lm ON true`;

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
  if (before !== null || promoted.length === 0) {
    return withStoppedCaption(userId, result.rows.map(cleanPreview));
  }
  const goals = await query<ThreadRow>(
    `SELECT
       ${THREAD_LIST_COLUMNS}
     ${THREAD_LIST_JOINS}
     WHERE t.id = ANY($1::bigint[])
     ORDER BY t.updated_at DESC, t.id DESC`,
    [promoted],
  );
  return withStoppedCaption(userId, [...goals.rows, ...result.rows].map(cleanPreview));
}

/**
 * Row 207 — a goal its owner cancelled reads the same as one that succeeded.
 *
 * Both land on `done`, because `ThreadStatus` has one word for „this is over"
 * and the product needs two. The caption was supposed to carry the difference
 * and does not survive: any later `setThreadStatus(..., 'done')` passing no
 * line takes `STATUS_LINES.done`, which is null, and erases it. On account 501
 * that is thirty-seven of seventy stopped goals with nothing left to show.
 *
 * So the caption is supplied here when the goal record says the goal was
 * stopped and the thread has lost its own. Derived rather than migrated, for
 * the reason the status above it is derived: it fixes every existing thread at
 * once and needs nobody's permission to write across live data.
 *
 * THE LANGUAGE IS READ ONCE FOR THE WHOLE LIST, not per thread. A caption is
 * chrome, the list is one screen, and forty extra queries to vary one word
 * across it would be the wrong trade — the owner's most recent words decide,
 * which is the same rule every other fixed string follows.
 *
 * It does NOT overwrite a caption that is still there: a thread that kept its
 * own says whatever it was given, in whatever language it was given in.
 */
async function withStoppedCaption(userId: string, rows: ThreadRow[]): Promise<ThreadRow[]> {
  const needsOne = rows.some((r) => r.goal_stopped === true && r.status_line === null);
  if (!needsOne) return rows;
  const language = await userLanguage(userId).catch(() => 'ka' as RunLanguage);
  return rows.map((r) =>
    r.goal_stopped === true && r.status_line === null
      ? { ...r, status_line: STOPPED_STATUS_LINE[language] }
      : r,
  );
}

/**
 * The one-line preview is a display boundary too (Ticket 11 Task 1 (d), Q-58):
 * older stored replies still carry raw em dashes and bold, and the list read
 * them verbatim while the message read was already clean.
 */
function cleanPreview(row: ThreadRow): ThreadRow {
  if (row.last_message === null || row.last_message === undefined) return row;
  return {
    ...row,
    last_message: stripEmDashesForDisplay(scrubMechanicalForStorage(row.last_message)),
  };
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
export const DEFAULT_NEW_THREAD_TITLE = NEW_THREAD_TITLE.ka;

export async function createThread(
  userId: string,
  type: Thread['type'],
  title?: string,
  introRequestId?: number,
  task?: ThreadTaskState,
): Promise<Thread> {
  /**
   * The placeholder in the OWNER's language, which needs a read — and takes
   * one only when it is actually about to be used. A thread created with a
   * title of its own (an ask thread, a request thread) asks nothing.
   */
  const placeholder =
    title === undefined && type === 'regular'
      ? NEW_THREAD_TITLE[await userLanguage(userId).catch(() => 'ka' as RunLanguage)]
      : null;
  const result = await query<Thread>(
    `INSERT INTO threads (user_id, type, title, introduction_request_id, is_task, status, status_line)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, type, title, introduction_request_id, is_task, status, status_line,
               created_at, updated_at`,
    [
      userId,
      type,
      title ?? placeholder,
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
    // The same honesty as the list: the chat header read „finished" on the
    // founder's running goal because it read this row and not the goal.
    `SELECT t.id, t.user_id, t.type, t.title, t.introduction_request_id, t.is_task,
            ${STATUS_HONEST_ABOUT_OPEN_GOALS} AS status,
            ${STATUS_LINE_HONEST_ABOUT_OPEN_GOALS} AS status_line,
            t.created_at, t.updated_at
     FROM threads t
     WHERE t.id = $1 AND t.user_id = $2
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

export interface ThreadMoveOutcome {
  moved: number[];
  tasks_moved: number[];
  messages_moved: number;
}

/**
 * Move whole conversations from one account to another (Ticket 12 Task 59:
 * the test chats run from the founder's seat sit in HIS list). A move, not a
 * delete: the thread row, its messages and the goal living on it all change
 * owner in one transaction, and the same call with the two accounts swapped
 * is the undo. Only threads the source account owns are touched; costs and
 * run stamps stay where they were incurred (they are an audit trail of the
 * account that spent, not of who reads the chat now).
 */
export async function moveThreads(
  fromUserId: string,
  toUserId: string,
  threadIds: readonly number[],
): Promise<ThreadMoveOutcome> {
  if (threadIds.length === 0 || fromUserId === toUserId) {
    return { moved: [], tasks_moved: [], messages_moved: 0 };
  }
  const { withTransaction } = await import('../db/postgres/client');
  return withTransaction(async (client) => {
    const owned = await client.query<{ id: number }>(
      'SELECT id FROM threads WHERE id = ANY($1::int[]) AND user_id = $2 FOR UPDATE',
      [threadIds, fromUserId],
    );
    const ids = owned.rows.map((r) => r.id);
    if (ids.length === 0) return { moved: [], tasks_moved: [], messages_moved: 0 };
    const messages = await client.query(
      'UPDATE conversations SET user_id = $2 WHERE thread_id = ANY($1::int[]) AND user_id = $3',
      [ids, toUserId, fromUserId],
    );
    // tasks.user_id is TEXT (migration 040): the parameters stay uncast.
    const tasks = await client.query<{ id: number }>(
      'UPDATE tasks SET user_id = $2 WHERE thread_id = ANY($1::int[]) AND user_id = $3 RETURNING id',
      [ids, toUserId, fromUserId],
    );
    await client.query(
      'UPDATE threads SET user_id = $2, updated_at = NOW() WHERE id = ANY($1::int[]) AND user_id = $3',
      [ids, toUserId, fromUserId],
    );
    return {
      moved: ids,
      tasks_moved: tasks.rows.map((t) => t.id),
      messages_moved: messages.rowCount ?? 0,
    };
  });
}

/** The threads one account opened on one calendar day (UTC) — the move's usual selection. */
export async function threadIdsCreatedOn(
  userId: string,
  day: string,
): Promise<{ id: number; title: string | null; is_task: boolean }[]> {
  const result = await query<{ id: number; title: string | null; is_task: boolean }>(
    `SELECT id, title, is_task FROM threads
     WHERE user_id = $1 AND created_at::date = $2::date
     ORDER BY id`,
    [userId, day],
  );
  return result.rows;
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
       -- Ticket 20 row 132, second pass: answered_by rides with the message.
       -- The seat reads replies only through this endpoint, so a column they
       -- cannot see is a column that does not exist for the people whose
       -- question it was written to answer.
       SELECT id, role, content, kind, run_id, created_at, choices, share_text,
              answered_by
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
 * The language a thread is held in, from the owner's own words.
 *
 * The seat's #4061 (h): the server's fixed strings were Georgian in an English
 * thread. A RUN knows its language; a BUTTON has no run, so the route has to
 * ask. Same rule languageOfConversation applies — the newest message that
 * carries a script decides, and a short Latin „ok" does not move a Georgian
 * conversation.
 *
 * Only the owner's own messages are read. The assistant's are evidence of what
 * the assistant did, and when it got the language wrong they are evidence of
 * the bug rather than of the conversation.
 */
export async function threadLanguage(threadId: number): Promise<RunLanguage> {
  const [latest, ...earlier] = await ownerMessages(threadId);
  if (latest !== undefined) return languageOfConversation(latest, earlier);
  /**
   * AN EMPTY THREAD IS NOT A GEORGIAN THREAD. The seat measured it on Test 1,
   * 20 September, reading one object at one moment:
   *
   *   six threads with NO messages     language: "ka"     title: "New conversation"
   *   five threads WITH messages       language: "en"
   *
   * and that account has never written a Georgian character anywhere. Two
   * parts of the server falling back to two different defaults, in the same
   * response — the title had already been taught to ask the owner and this
   * had not.
   *
   * `return 'ka'` was right when it was written, because there was nothing
   * else to ask. There is now: `userLanguage` reads what this person writes
   * EVERYWHERE, so an empty thread on an eight-thread English account answers
   * English. Georgian survives as the last resort, for an account that has
   * genuinely never said anything.
   *
   * It is not a display detail. `threadLanguage` is what the reaper and the
   * task engine write their messages in, and a thread is emptiest exactly when
   * the engine is first writing into it.
   */
  const owner = await query<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM threads WHERE id = $1 LIMIT 1`,
    [threadId],
  );
  const ownerId = owner.rows[0]?.user_id;
  if (ownerId === undefined) return 'ka';
  return userLanguage(ownerId);
}

/**
 * The owner's OWN messages in this thread, newest first — and the only
 * trustworthy source for the question „what language is this conversation in".
 *
 * Exported because chat.service was reconstructing this list from the model's
 * history and getting it wrong, in two ways that a prefix test cannot survive:
 * `loadHistory` WRAPS an engine turn in server-turn markers, so the text no
 * longer begins with the marker that identifies it, and `mergeAdjacentSameRole`
 * folds two adjacent user rows into one block array, so an engine note and a
 * real message become a single value with no boundary between them.
 *
 * Neither transformation is wrong — the model's history needs both. They just
 * make that list the wrong place to ask this question, and the right place has
 * existed in this file all along: `kind = 'message'` excludes an engine turn by
 * what it IS rather than by how its text happens to start, and rows come back
 * one per row.
 */
export async function ownerMessages(threadId: number): Promise<string[]> {
  const result = await query<{ content: string }>(
    `SELECT content FROM conversations
     WHERE thread_id = $1 AND role = 'user' AND kind = 'message' AND content <> ''
     ORDER BY created_at DESC
     LIMIT $2`,
    [threadId, LANGUAGE_SAMPLE_MESSAGES],
  );
  return result.rows.map((r) => r.content);
}

/**
 * The language a PERSON writes in, across everything they have ever said here.
 *
 * `threadLanguage` cannot answer for an incoming ask: that thread is created
 * empty, in the same breath as the message being written into it, so there is
 * nothing in it to read. The recipient's own words elsewhere are the only
 * evidence there is — and it must be the RECIPIENT's, not the sender's. Who is
 * asking has no bearing on which language the person reading it can read.
 *
 * Georgian for somebody who has never written anything, which is the product's
 * home language and what every one of these messages was until now. That case
 * is a genuinely new member and nothing here can do better; what it must not
 * do is guess from the sender.
 */
export async function userLanguage(userId: string): Promise<RunLanguage> {
  const result = await query<{ content: string }>(
    `SELECT content FROM conversations
     WHERE user_id = $1 AND role = 'user' AND kind = 'message' AND content <> ''
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, LANGUAGE_SAMPLE_MESSAGES],
  );
  const [latest, ...earlier] = result.rows.map((r) => r.content);
  if (latest === undefined) return 'ka';
  return languageOfConversation(latest, earlier);
}

/** Enough to see past a „ok" or two without reading a whole conversation. */
const LANGUAGE_SAMPLE_MESSAGES = 8;

/**
 * Take the buttons off every message in a thread, permanently.
 *
 * Ticket 20 row 113 / the founder's 17 September ruling, the half he called
 * the worse one: „the card must go inert the moment its goal is stopped;
 * today a stopped goal's plan can still be approved, and approving it would
 * start writing to real people."
 *
 * emitChoicesCleared already takes them off the LIVE screen. It is not
 * enough, and thread 16906 is why: the labels are stored on the message row,
 * so a reload renders them again, and the SSE event that cleared the first
 * screen never reached a second device at all. The buttons come back looking
 * exactly as they did before the owner stopped the goal.
 *
 * Returns how many rows still had buttons on them, because „I cleared the
 * screen" and „there was nothing to clear" are different facts and this
 * codebase has now confused that pair four times in a week.
 *
 * The text is left alone. The plan is still in the conversation and still
 * readable — what is removed is the ability to act on it, which is what the
 * owner asked for when they stopped the goal.
 */
export async function clearStoredChoices(threadId: number): Promise<number> {
  const result = await query(
    `UPDATE conversations SET choices = NULL
     WHERE thread_id = $1 AND choices IS NOT NULL`,
    [threadId],
  );
  return result.rowCount ?? 0;
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

/**
 * Whether the last thing the assistant said in this thread is exactly this.
 *
 * For the lines a non-run path writes — the token-wall notice and its
 * news-carrying variant — where the question „have they already been told
 * this" cannot be answered by a status badge: a badge records the SUBJECT,
 * so a generic pause written first would swallow the news that came after it,
 * while the answer sweep retries every tick and would repeat whichever line
 * came first. Comparing the text answers the question actually being asked.
 *
 * Deliberately the LAST message and not „anywhere in the thread": a person
 * told once, then told six other things, then told again, has not been
 * repeated at — they have been reminded.
 *
 * AND IT COMPARES WHAT WOULD BE STORED, NOT WHAT WAS PASSED IN. The first
 * version of this did not, and the seat counted the result: eighteen copies of
 * one sentence on one person's screen, one every five minutes, on an account
 * that could not pay.
 *
 * `saveThreadMessage` runs `scrubMechanicalForStorage` over every assistant
 * message on the way in — it is two lines below this one — so the text handed
 * to this function and the text in the database are never the same string when
 * the scrub touches anything. The line in question contained an em dash, which
 * the scrub rewrites to a comma. The guard was therefore comparing two values
 * that could not be equal, and a check that can never pass is not a check.
 *
 * The same transformation, in the same file, applied by the reader and the
 * writer — so they cannot drift again without both changing.
 */
export async function lastAssistantMessageIs(threadId: number, text: string): Promise<boolean> {
  const result = await query<{ content: string }>(
    `SELECT content FROM conversations
     WHERE thread_id = $1 AND role = 'assistant' AND kind = 'message' AND content <> ''
     ORDER BY created_at DESC
     LIMIT 1`,
    [threadId],
  );
  return result.rows[0]?.content === scrubMechanicalForStorage(text);
}

export async function saveThreadMessage(
  threadId: number,
  userId: number,
  role: 'user' | 'assistant',
  content: string,
  // 'error' renders as a system-styled failure with a retry in the client —
  // never as words the assistant said.
  kind: 'message' | 'error' = 'message',
  /**
   * Ticket 20 row 202 — which run this belongs to.
   *
   * The seat asked for a join: every failure since 13 September against the
   * timer that fired. It cannot be done, and this parameter is why it could
   * not. Twenty-two of the twenty-eight failure rows in the last five days
   * carry no run id, because the two places that write a failure — the route's
   * catch and the task engine's — both called this function without one. The
   * row that records a run dying is the one row that cannot be traced back to
   * the run that died.
   *
   * The same shape as row 125 and row 126: a record nobody can ask about. It
   * is optional so the engine's own sentences, which belong to no run, stay
   * honest about that rather than borrowing an id.
   */
  runId: string | null = null,
): Promise<void> {
  // The engine's own sentences (an ask's opening, a campaign invite, a wake
  // note) are assistant text too — the mechanical scrub applies to them as to
  // a model reply (Ticket 11 Task 1: three of the first night's messages
  // still carried an em dash, all three written here).
  const stored = role === 'assistant' ? scrubMechanicalForStorage(content) : content;
  await query(
    `INSERT INTO conversations (thread_id, user_id, role, content, content_json, kind, run_id)
     VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
    [threadId, userId, role, stored, kind, runId],
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
  // The MEDIATOR's own language — their sidebar, their message. Georgian for
  // somebody who has never written anything here, which is what this always
  // was and is the only case nothing can do better on.
  const language = await userLanguage(String(mediatorUserId)).catch(() => 'ka' as RunLanguage);
  const title = incomingRequestTitle(language, requesterName, targetName, direct);
  // The mediator must answer this request — the thread is born a task awaiting them.
  const thread = await createThread(
    String(mediatorUserId),
    'incoming_request',
    title,
    introRequestId,
    {
      isTask: true,
      status: 'needs_you',
      statusLine: RUN_STRINGS[language].statusLines.needs_you,
    },
  );

  await saveThreadMessage(
    thread.id,
    mediatorUserId,
    'assistant',
    incomingRequestOpening(language, requesterName, targetName, message, direct),
  );

  return thread;
}

export async function createOutgoingRequestThread(
  requesterUserId: number,
  introRequestId: number,
  mediatorName: string,
  targetName: string,
  direct = false,
): Promise<Thread> {
  // The REQUESTER's own language, which need not be the mediator's. Two
  // readers, two threads, one each.
  const language = await userLanguage(String(requesterUserId)).catch(() => 'ka' as RunLanguage);
  const title = outgoingRequestTitle(language, mediatorName, targetName, direct);
  // The requester is waiting on the mediator — born a task in the waiting state.
  const thread = await createThread(
    String(requesterUserId),
    'outgoing_request',
    title,
    introRequestId,
    {
      isTask: true,
      status: 'waiting',
      statusLine: RUN_STRINGS[language].statusLines.waiting,
    },
  );

  await saveThreadMessage(
    thread.id,
    requesterUserId,
    'assistant',
    outgoingRequestOpening(language, mediatorName, targetName, direct),
  );

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
