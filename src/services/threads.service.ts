import { query } from '../db/postgres/client';
import { stripAllowedSpans, stripEmDashesForDisplay } from './privacyScrub';

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
  type: 'regular' | 'incoming_request' | 'outgoing_request' | 'incoming_ask';
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
  role: string;
  content: string;
  kind: string;
  run_id: string | null;
  created_at: string;
}

interface ThreadRow extends Thread {
  last_message: string | null;
  last_message_at: string | null;
  // Public ref of the linked introduction request (null on regular threads) —
  // what the client posts to /requests/:ref/{accept,decline,snooze}.
  request_ref: string | null;
}

export async function getThreadsForUser(userId: string): Promise<ThreadRow[]> {
  const result = await query<ThreadRow>(
    `SELECT
       t.id,
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
       lm.content AS last_message,
       lm.created_at AS last_message_at
     FROM threads t
     LEFT JOIN introduction_requests ir ON ir.id = t.introduction_request_id
     LEFT JOIN LATERAL (
       SELECT content, created_at
       FROM conversations
       WHERE thread_id = t.id AND content != ''
       ORDER BY created_at DESC
       LIMIT 1
     ) lm ON true
     WHERE t.user_id = $1
     ORDER BY t.updated_at DESC`,
    [userId],
  );
  return result.rows;
}

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
      title ?? null,
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

export async function getThreadMessages(
  threadId: number,
  opts: { includeSteps?: boolean } = {},
): Promise<ThreadMessage[]> {
  // Step rows are live-run narration (kept in the DB as timeout-salvage
  // material) — in the chat view they read as the assistant saying almost the
  // same thing twice (ticket 3 §6.2: a step at 07:49:11 and the final message
  // at 07:49:20 in thread 7921). 'event' rows are engine turns written FOR THE
  // MODEL — tags, tool instructions and all (ticket 4 item 0C.2). Neither
  // belongs in a chat; the admin window keeps both for word-for-word
  // inspection.
  const kindFilter = opts.includeSteps ? '' : ` AND kind NOT IN ('step', 'event')`;
  const result = await query<ThreadMessage>(
    `SELECT role, content, kind, run_id, created_at
     FROM conversations
     WHERE thread_id = $1 AND content != ''${kindFilter}
     ORDER BY created_at ASC`,
    [threadId],
  );
  // Reveal own-number passthrough spans at this display boundary (stored text
  // keeps the markers so repeated scrub passes stay idempotent). Em dashes are
  // stripped from the ASSISTANT's prose only (brand rule, render-layer fix).
  return result.rows.map((row) => ({
    ...row,
    content:
      row.role === 'assistant'
        ? stripEmDashesForDisplay(stripAllowedSpans(row.content))
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
): Promise<Thread> {
  const title = `${requesterName} → ${targetName}`;
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

  const openingMessage =
    `გამარჯობა! **${requesterName}**-ს გინდა გეცნოს **${targetName}**-ს Netai-ის მეშვეობით.` +
    (message ? `\n\nმათი შეტყობინება: _"${message}"_` : '') +
    `\n\nდაეხმარები? 🤝`;

  await saveThreadMessage(thread.id, mediatorUserId, 'assistant', openingMessage);

  return thread;
}

export async function createOutgoingRequestThread(
  requesterUserId: number,
  introRequestId: number,
  mediatorName: string,
  targetName: string,
): Promise<Thread> {
  const title = `${mediatorName} → ${targetName}`;
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

  const openingMessage =
    `**${mediatorName}**-სთვის გაიგზავნა გაცნობის მოთხოვნა **${targetName}**-ზე.\n\n` +
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
