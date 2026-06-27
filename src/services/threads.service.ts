import { query } from '../db/postgres/client';

export interface Thread {
  id: number;
  user_id: number;
  type: 'regular' | 'incoming_request' | 'outgoing_request';
  title: string | null;
  introduction_request_id: number | null;
  created_at: string;
  updated_at: string;
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
}

export async function getThreadsForUser(userId: string): Promise<ThreadRow[]> {
  const result = await query<ThreadRow>(
    `SELECT
       t.id,
       t.user_id,
       t.type,
       t.title,
       t.introduction_request_id,
       t.created_at,
       t.updated_at,
       lm.content AS last_message,
       lm.created_at AS last_message_at
     FROM threads t
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
): Promise<Thread> {
  const result = await query<Thread>(
    `INSERT INTO threads (user_id, type, title, introduction_request_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, type, title, introduction_request_id, created_at, updated_at`,
    [userId, type, title ?? null, introRequestId ?? null],
  );
  return result.rows[0];
}

export async function getThread(threadId: number, userId: string): Promise<Thread | null> {
  const result = await query<Thread>(
    `SELECT id, user_id, type, title, introduction_request_id, created_at, updated_at
     FROM threads
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [threadId, userId],
  );
  return result.rows[0] ?? null;
}

export async function getThreadByIntroRequestId(introRequestId: number): Promise<Thread | null> {
  const result = await query<Thread>(
    `SELECT id, user_id, type, title, introduction_request_id, created_at, updated_at
     FROM threads
     WHERE introduction_request_id = $1
     LIMIT 1`,
    [introRequestId],
  );
  return result.rows[0] ?? null;
}

export async function updateThreadTitle(threadId: number, title: string): Promise<void> {
  await query(`UPDATE threads SET title = $1, updated_at = NOW() WHERE id = $2`, [title, threadId]);
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

  const created = await createThread(userId, 'regular', 'Ally Chat');
  return created.id;
}

export async function getThreadMessages(threadId: number): Promise<ThreadMessage[]> {
  const result = await query<ThreadMessage>(
    `SELECT role, content, kind, run_id, created_at
     FROM conversations
     WHERE thread_id = $1 AND content != ''
     ORDER BY created_at ASC`,
    [threadId],
  );
  return result.rows;
}

export async function saveThreadMessage(
  threadId: number,
  userId: number,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  await query(
    `INSERT INTO conversations (thread_id, user_id, role, content, content_json)
     VALUES ($1, $2, $3, $4, NULL)`,
    [threadId, userId, role, content],
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
  const thread = await createThread(
    String(mediatorUserId),
    'incoming_request',
    title,
    introRequestId,
  );

  const openingMessage =
    `გამარჯობა! **${requesterName}**-ს გინდა გეცნოს **${targetName}**-ს Ally-ის მეშვეობით.` +
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
  const thread = await createThread(
    String(requesterUserId),
    'outgoing_request',
    title,
    introRequestId,
  );

  const openingMessage =
    `**${mediatorName}**-სთვის გაიგზავნა გაცნობის მოთხოვნა **${targetName}**-ზე.\n\n` +
    `**${mediatorName}** Ally-ს შემდეგ გახსნისას ნახავს და გიპასუხებს. 😊`;

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
