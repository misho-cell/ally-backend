import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';
import { emitThreadCreated, emitThreadUpdated } from './sse.service';

/**
 * #7360 (founder's word D871 / D873, 22 Oct): Netai writes to one real user in
 * its OWN name — an apology, news, a match. Until now every message reached a
 * person from some member's assistant; there was no voice for Netai itself
 * (board 72641), and four approved texts waited (72637).
 *
 * A user has one conversation titled „Netai", reused for every later message.
 * The text goes in exactly as the founder approved it: nothing rewrites it,
 * and no model runs in that conversation. What the user writes or taps there
 * is kept and shown on the admin, for the team to answer.
 */
export const NETAI_THREAD_TITLE = 'Netai';
export const MAX_NETAI_MESSAGE_CHARS = 4_000;
export const MAX_NETAI_CHOICES = 4;
export const MAX_NETAI_CHOICE_CHARS = 60;
const PUSH_BODY_CHARS = 120;
const NETAI_QUERY_TIMEOUT_MS = 5_000;
const MAX_LISTED = 50;
/** The advisory-lock space for Netai's own sends (the second key is the user). */
const NETAI_SEND_LOCK = 7725;
export const MAX_CLIENT_MSG_ID_CHARS = 100;

export interface NetaiMessageInput {
  readonly userId: number;
  readonly text: string;
  readonly choices: readonly string[];
  readonly sentBy: string;
  /** #7725: the caller's own key; the same key for the same person is one message. */
  readonly clientMsgId?: string | null;
}

export interface SentNetaiMessage {
  readonly id: number;
  readonly threadId: number;
  readonly newThread: boolean;
  /** True when this key was sent before: the earlier message, and nothing sent now. */
  readonly repeated?: boolean;
}

export interface NetaiMessageRow {
  readonly id: number;
  readonly thread_id: number;
  readonly body: string;
  readonly choices: readonly string[] | null;
  readonly sent_by: string;
  readonly sent_at: string;
  readonly seen_at: string | null;
  readonly reply: string | null;
  readonly replied_at: string | null;
}

export interface NetaiRecipient {
  readonly name: string | null;
  readonly testSeat: boolean;
}

/**
 * The account a message may go to: present and not deleted (118509 was not).
 * A fictional test seat may receive one too — that is how staging is tested —
 * and the answer says it is one.
 */
export async function netaiRecipient(userId: number): Promise<NetaiRecipient | null> {
  const result = await query<{ name: string | null; seat: boolean }>(
    `SELECT NULLIF(TRIM(u.name), '') AS name,
            EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id) AS seat
       FROM "User" u
      WHERE u.id = $1::int AND u."deletedAt" IS NULL
      LIMIT 1`,
    [userId],
    NETAI_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : { name: row.name, testSeat: row.seat };
}

/** The user's existing „Netai" conversation, if one is still there. */
async function existingNetaiThread(client: PoolClient, userId: number): Promise<number | null> {
  const result = await client.query<{ thread_id: number }>(
    `SELECT m.thread_id
       FROM netai_messages m
       JOIN threads t ON t.id = m.thread_id AND t.user_id = m.user_id
      WHERE m.user_id = $1
      ORDER BY m.sent_at DESC
      LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.thread_id ?? null;
}

async function newNetaiThread(client: PoolClient, userId: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO threads (user_id, type, title, is_task, status)
     VALUES ($1, 'regular', $2, false, 'done')
     RETURNING id`,
    [userId, NETAI_THREAD_TITLE],
  );
  return result.rows[0].id;
}

/** The message this key already sent to this person, if any. */
async function sentUnderKey(
  client: PoolClient,
  userId: number,
  key: string,
): Promise<SentNetaiMessage | null> {
  // One send per person at a time, so two calls with one key cannot both pass the check.
  await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [NETAI_SEND_LOCK, userId]);
  const found = await client.query<{ id: number; thread_id: number }>(
    `SELECT id, thread_id FROM netai_messages WHERE user_id = $1 AND client_msg_id = $2 LIMIT 1`,
    [userId, key],
  );
  const row = found.rows[0];
  return row === undefined
    ? null
    : { id: row.id, threadId: row.thread_id, newThread: false, repeated: true };
}

/** Thread, conversation row and record in one transaction: all of them, or none. */
async function writeNetaiMessage(input: NetaiMessageInput): Promise<SentNetaiMessage> {
  return withTransaction(async (client) => {
    const key = input.clientMsgId ?? null;
    const earlier = key === null ? null : await sentUnderKey(client, input.userId, key);
    if (earlier !== null) return earlier;
    const existing = await existingNetaiThread(client, input.userId);
    const threadId = existing ?? (await newNetaiThread(client, input.userId));
    const choices = input.choices.length > 0 ? JSON.stringify(input.choices) : null;
    await client.query(
      `INSERT INTO conversations (thread_id, user_id, role, content, content_json, kind, run_id, choices)
       VALUES ($1, $2, 'assistant', $3, NULL, 'message', NULL, $4::jsonb)`,
      [threadId, input.userId, input.text, choices],
    );
    await client.query(`UPDATE threads SET updated_at = NOW() WHERE id = $1`, [threadId]);
    const saved = await client.query<{ id: number }>(
      `INSERT INTO netai_messages (user_id, thread_id, body, choices, sent_by, client_msg_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id`,
      [input.userId, threadId, input.text, choices, input.sentBy, key],
    );
    return { id: saved.rows[0].id, threadId, newThread: existing === null };
  });
}

/** The first words of the message, for the lock screen. */
export function netaiPushBody(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length <= PUSH_BODY_CHARS ? flat : `${flat.slice(0, PUSH_BODY_CHARS - 1)}…`;
}

/** Writes the message, then tells the user's open app and rings the phone. */
export async function sendNetaiMessage(input: NetaiMessageInput): Promise<SentNetaiMessage> {
  const sent = await writeNetaiMessage(input);
  if (sent.repeated === true) return sent;
  const userId = String(input.userId);
  if (sent.newThread) {
    emitThreadCreated(userId, {
      id: sent.threadId,
      type: 'regular',
      title: NETAI_THREAD_TITLE,
      is_task: false,
      status: 'done',
      status_line: null,
    });
  } else {
    emitThreadUpdated(userId, { id: sent.threadId, title: NETAI_THREAD_TITLE });
  }
  await sendPushNotification(userId, {
    title: NETAI_THREAD_TITLE,
    body: netaiPushBody(input.text),
    url: `/chat/${sent.threadId}`,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(`[netai-message] ${sent.id}: push not sent:`, (err as Error).message);
  });
  return sent;
}

/** True when this conversation is the user's „Netai" one. */
export async function isNetaiThread(threadId: number): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM netai_messages WHERE thread_id = $1) AS found`,
    [threadId],
    NETAI_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

/** The user opened the conversation: every message there not yet seen now is. */
export async function markNetaiSeen(threadId: number, userId: number): Promise<void> {
  await query(
    `UPDATE netai_messages SET seen_at = NOW()
      WHERE thread_id = $1 AND user_id = $2 AND seen_at IS NULL`,
    [threadId, userId],
    NETAI_QUERY_TIMEOUT_MS,
  );
}

/** The user's answer belongs to the latest message; a later answer is added below the earlier. */
export async function recordNetaiReply(
  threadId: number,
  userId: number,
  reply: string,
): Promise<void> {
  await query(
    `UPDATE netai_messages
        SET reply = CASE WHEN reply IS NULL THEN $3 ELSE reply || E'\\n' || $3 END,
            replied_at = NOW(),
            seen_at = COALESCE(seen_at, NOW())
      WHERE id = (SELECT id FROM netai_messages
                   WHERE thread_id = $1 AND user_id = $2
                   ORDER BY sent_at DESC
                   LIMIT 1)`,
    [threadId, userId, reply],
    NETAI_QUERY_TIMEOUT_MS,
  );
}

/** What Netai sent this user, newest first, with when it was seen and what came back. */
export async function netaiMessagesTo(userId: number): Promise<readonly NetaiMessageRow[]> {
  const result = await query<NetaiMessageRow>(
    `SELECT id, thread_id, body, choices, sent_by, sent_at, seen_at, reply, replied_at
       FROM netai_messages
      WHERE user_id = $1
      ORDER BY sent_at DESC
      LIMIT $2`,
    [userId, MAX_LISTED],
    NETAI_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
