import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';
import { RUN_STRINGS } from './runLanguage';
import { emitMessageAppended } from './sse.service';
import { saveServerLine, threadLanguage } from './threads.service';

/**
 * #502 (§99.8): the owner's own „remind me in 15 minutes".
 *
 * The master test run of 7 October (RW-005, seat 179082): inside a goal the run
 * set the goal's wake for a quarter hour and still wrote „I cannot set a
 * reminder"; at the wake it searched again and reminded nobody. In a plain
 * conversation there was no goal, so no wake at all, and the owner was told to
 * set a phone alarm. A goal's wake wakes the MODEL; a reminder is a line the
 * OWNER reads. So a reminder is its own row: the run stores the line and the
 * time, and at that time the server writes it into the same conversation and
 * rings the owner once. No model runs then, so nothing else can happen.
 */
const QUERY_TIMEOUT_MS = 5_000;
const REMINDERS_PER_SWEEP = 50;
/** The soonest a reminder can be set for, and the latest: a minute, a week. */
export const MIN_REMINDER_MINUTES = 1;
export const MAX_REMINDER_MINUTES = 7 * 24 * 60;
/** A reminder is one line; longer text is cut, not refused. */
export const MAX_REMINDER_CHARS = 300;
const REMINDER_MARK = '⏰';
const MS_PER_MINUTE = 60_000;

export interface NewReminder {
  readonly userId: number;
  readonly threadId: number;
  readonly text: string;
  readonly minutes: number;
}

export interface DueReminder {
  readonly id: number;
  readonly user_id: number;
  readonly thread_id: number;
  readonly text: string;
}

/** The minutes asked for, kept between a minute and a week. */
export function clampReminderMinutes(minutes: number): number {
  return Math.min(MAX_REMINDER_MINUTES, Math.max(MIN_REMINDER_MINUTES, Math.round(minutes)));
}

/** The line the owner reads: one line, marked as a reminder, never longer than the cap. */
export function reminderLine(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim().slice(0, MAX_REMINDER_CHARS).trim();
  return oneLine.startsWith(REMINDER_MARK) ? oneLine : `${REMINDER_MARK} ${oneLine}`;
}

/** Stores the reminder; returns when it is due. */
export async function setOwnerReminder(reminder: NewReminder): Promise<Date> {
  const dueAt = new Date(Date.now() + clampReminderMinutes(reminder.minutes) * MS_PER_MINUTE);
  await query(
    `INSERT INTO owner_reminders (user_id, thread_id, text, due_at)
     VALUES ($1, $2, $3, $4)`,
    [reminder.userId, reminder.threadId, reminderLine(reminder.text), dueAt],
    QUERY_TIMEOUT_MS,
  );
  return dueAt;
}

/** Claims the reminders whose time has come; each is claimed by one sweep only. */
export async function claimDueReminders(): Promise<DueReminder[]> {
  const result = await query<{
    id: string | number;
    user_id: number;
    thread_id: number;
    text: string;
  }>(
    `UPDATE owner_reminders SET sent_at = NOW()
      WHERE id IN (SELECT id FROM owner_reminders
                    WHERE sent_at IS NULL AND due_at <= NOW()
                    ORDER BY due_at
                    LIMIT $1
                    FOR UPDATE SKIP LOCKED)
      RETURNING id, user_id, thread_id, text`,
    [REMINDERS_PER_SWEEP],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    user_id: r.user_id,
    thread_id: r.thread_id,
    text: r.text,
  }));
}

/** Writes the reminder into its conversation, shows it on an open screen, rings the owner. */
export async function deliverReminder(reminder: DueReminder): Promise<void> {
  const saved = await saveServerLine(reminder.thread_id, reminder.user_id, reminder.text);
  emitMessageAppended(String(reminder.user_id), reminder.thread_id, randomUUID(), {
    messageId: String(saved.id),
    kind: 'reminder',
    content: saved.content,
    choices: [],
    ref: {},
    createdAt: saved.createdAt,
  });
  const language = await threadLanguage(reminder.thread_id);
  await sendPushNotification(String(reminder.user_id), {
    title: RUN_STRINGS[language].reminderPush.title,
    body: saved.content,
    url: `/chat/${reminder.thread_id}`,
  });
}

/**
 * #502 (the tester's 46334, b, 1 of 2): inside a goal waiting on its city
 * question, „შემახსენე 2 წუთში" first started the goal's work — a plan card —
 * and only then set the reminder. A message that is only a reminder request is
 * answered with the reminder alone: that run holds set_reminder and nothing else.
 */
const REMINDER_REQUEST_RE = /^\s*(?:შემახსენე|გამახსენე|remind me\b|напомни)/iu;
const MAX_REMINDER_REQUEST_CHARS = 160;

export function isReminderRequestOnly(message: string): boolean {
  return message.trim().length <= MAX_REMINDER_REQUEST_CHARS && REMINDER_REQUEST_RE.test(message);
}
