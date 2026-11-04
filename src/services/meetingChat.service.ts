import { query } from '../db/postgres/client';
import { relayedForReader } from './askTranslation.service';
import {
  askerGreeting,
  meetingOpening,
  meetingTitle,
  relayedLine,
  targetGreeting,
} from './meetingChat';
import { sendPushNotification } from './notification.service';
import { nameAsReaderSaved } from './readerSavedName';
import { RunLanguage } from './runLanguage';
import { createThread, saveThreadMessage, userLanguage } from './threads.service';

/**
 * #8878: the two members' chat after the double yes — one ordinary thread each,
 * linked in meeting_chats, so today's app shows it with no change. The server
 * carries each line across; no model run stands between them.
 */
const QUERY_TIMEOUT_MS = 5_000;
const NO_NAME = '';

export interface MeetingParties {
  readonly requestId: number;
  readonly askerUserId: number;
  readonly targetUserId: number;
  readonly mediatorUserId: number | null;
  /** The asker's reason as stored on the request, already about the asker. */
  readonly need: string | null;
}

async function registeredNames(ids: readonly number[]): Promise<Map<number, string>> {
  const result = await query<{ id: number; name: string | null }>(
    'SELECT id, name FROM "User" WHERE id = ANY($1::int[]) LIMIT $2',
    [ids, ids.length],
    QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [Number(r.id), r.name?.trim() || NO_NAME]));
}

async function languageOf(userId: number): Promise<RunLanguage> {
  return userLanguage(String(userId)).catch(() => 'ka' as RunLanguage);
}

/** One side of the chat: its thread, opened with who it is with, and the other's greeting. */
async function openSide(
  readerId: number,
  otherId: number,
  mediatorId: number | null,
  names: ReadonlyMap<number, string>,
  greeting: (language: RunLanguage, other: string, between: string) => Promise<string>,
): Promise<number> {
  const language = await languageOf(readerId);
  const [other, between] = await Promise.all([
    nameAsReaderSaved(readerId, otherId, names.get(otherId) ?? NO_NAME),
    mediatorId === null
      ? Promise.resolve(NO_NAME)
      : nameAsReaderSaved(readerId, mediatorId, names.get(mediatorId) ?? NO_NAME),
  ]);
  const thread = await createThread(String(readerId), 'regular', meetingTitle(language, other));
  await saveThreadMessage(
    thread.id,
    readerId,
    'assistant',
    meetingOpening(language, other, between),
  );
  await saveThreadMessage(
    thread.id,
    readerId,
    'assistant',
    await greeting(language, other, between),
  );
  await sendPushNotification(String(readerId), {
    title: 'Netai',
    body: meetingOpening(language, other, between),
    url: `/chat/${thread.id}`,
  }).catch(() => undefined);
  return thread.id;
}

/**
 * Opens the chat once per introduction. False when it already exists or could
 * not be opened — the introduction itself has gone through either way.
 */
export async function openMeetingChat(parties: MeetingParties): Promise<boolean> {
  const { requestId, askerUserId, targetUserId, mediatorUserId, need } = parties;
  try {
    const exists = await query<{ id: number }>(
      'SELECT id FROM meeting_chats WHERE intro_request_id = $1 LIMIT 1',
      [requestId],
      QUERY_TIMEOUT_MS,
    );
    if (exists.rows.length > 0) return false;
    const ids = [askerUserId, targetUserId, ...(mediatorUserId === null ? [] : [mediatorUserId])];
    const names = await registeredNames(ids);
    // The target reads the asker's greeting with the need; the asker reads the target's.
    const targetThread = await openSide(
      targetUserId,
      askerUserId,
      mediatorUserId,
      names,
      async (language, asker, between) => {
        const relayed = need === null ? null : await relayedForReader(need, language, 'request');
        return askerGreeting(language, asker, between, relayed?.text ?? need);
      },
    );
    const askerThread = await openSide(
      askerUserId,
      targetUserId,
      mediatorUserId,
      names,
      async (language, target, between) => targetGreeting(language, target, between),
    );
    await query(
      `INSERT INTO meeting_chats (intro_request_id, asker_user_id, asker_thread_id, target_user_id, target_thread_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (intro_request_id) DO NOTHING`,
      [requestId, askerUserId, askerThread, targetUserId, targetThread],
      QUERY_TIMEOUT_MS,
    );
    forgetMeetingThreads(askerUserId, targetUserId);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[meeting] request ${requestId}: the chat could not be opened:`,
      (err as Error).message,
    );
    return false;
  }
}

interface OtherSide {
  readonly other_user_id: number;
  readonly other_thread_id: number;
}

/**
 * #8524's budget: every line in an ordinary chat asks whether it is a meeting
 * chat. A member's meeting threads are read once a minute, not on every line.
 */
const MEETING_THREADS_KEPT_MS = 60_000;
const meetingThreadsSeen = new Map<
  string,
  { readonly threads: Set<number>; readonly at: number }
>();

async function meetingThreadsOf(userId: string): Promise<Set<number>> {
  const seen = meetingThreadsSeen.get(userId);
  if (seen !== undefined && Date.now() - seen.at < MEETING_THREADS_KEPT_MS) return seen.threads;
  const result = await query<{ thread_id: number }>(
    `SELECT asker_thread_id AS thread_id FROM meeting_chats WHERE asker_user_id = $1::int
     UNION SELECT target_thread_id FROM meeting_chats WHERE target_user_id = $1::int`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  const threads = new Set(result.rows.map((r) => Number(r.thread_id)));
  meetingThreadsSeen.set(userId, { threads, at: Date.now() });
  return threads;
}

/** A chat just opened is seen at once, not after the minute. */
function forgetMeetingThreads(...userIds: readonly number[]): void {
  for (const id of userIds) meetingThreadsSeen.delete(String(id));
}

/** The other person's side of this meeting chat, when this thread is one. */
async function otherSideOf(userId: string, threadId: number): Promise<OtherSide | null> {
  if (!(await meetingThreadsOf(userId)).has(threadId)) return null;
  const result = await query<OtherSide>(
    `SELECT CASE WHEN asker_thread_id = $1 THEN target_user_id ELSE asker_user_id END AS other_user_id,
            CASE WHEN asker_thread_id = $1 THEN target_thread_id ELSE asker_thread_id END AS other_thread_id
       FROM meeting_chats
      WHERE (asker_thread_id = $1 AND asker_user_id = $2::int)
         OR (target_thread_id = $1 AND target_user_id = $2::int)
      LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/**
 * Carries the owner's line to the other side of their meeting chat. False when
 * this thread is no meeting chat (the ordinary run takes the line).
 */
export async function relayInMeetingChat(
  userId: string,
  threadId: number,
  text: string,
): Promise<boolean> {
  if (text.trim() === '') return false;
  const other = await otherSideOf(userId, threadId);
  if (other === null) return false;
  const names = await registeredNames([Number(userId)]);
  const writer = await nameAsReaderSaved(
    other.other_user_id,
    Number(userId),
    names.get(Number(userId)) ?? NO_NAME,
  );
  const line = relayedLine(writer, text);
  await saveThreadMessage(other.other_thread_id, other.other_user_id, 'assistant', line);
  await sendPushNotification(String(other.other_user_id), {
    title: writer,
    body: text.trim(),
    url: `/chat/${other.other_thread_id}`,
  }).catch(() => undefined);
  return true;
}
