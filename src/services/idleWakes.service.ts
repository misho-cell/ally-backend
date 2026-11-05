import { query } from '../db/postgres/client';

/**
 * #8625 (the tester's DR12): plans waiting since 30 Oct
 * and introductions waiting since 27 Oct were re-raised at every daily wake.
 *
 * Idle is counted from the last time a PERSON wrote in the goal — the owner in its
 * conversation, or a helper answering one of its asks — never from the run's own
 * housekeeping, which touches last_activity_at at every wake.
 */
const QUERY_TIMEOUT_MS = 3_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * #8625, Tornike's rule (4 Nov 18:56, Misho's yes the same day): a waiting
 * goal is raised once after 1 day, once more after 4, and after a week the
 * owner is asked once whether to keep going, change it or close it — then it
 * is quiet. (The morning's 2 / 5 / 30 days is replaced.)
 */
export const FIRST_REMINDER_DAYS = 1;
export const SECOND_REMINDER_DAYS = 4;
export const CLOSE_QUESTION_DAYS = 7;
export const QUIET_DAYS = 30;

export enum IdleWake {
  /** A person wrote within two days: the wake runs as it always did. */
  Normal = 'normal',
  /** Two days idle: the one reminder. */
  Reminder = 'reminder',
  /** Five days idle: the second reminder, asking once whether to close. */
  CloseQuestion = 'close_question',
  /** Not due: the wake moves to `at`. */
  NotYet = 'not_yet',
}

export interface IdleState {
  readonly lastHumanAt: Date;
  readonly reminders: number;
  readonly remindedAt: Date | null;
}

export interface IdleDecision {
  readonly kind: IdleWake;
  /** When the next wake should be, for every kind but Normal. */
  readonly at: Date | null;
}

const after = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY_MS);

/** Pure: what a due scheduled wake does with a goal in this state. */
export function idleDecision(state: IdleState, now: Date): IdleDecision {
  const idleDays = (now.getTime() - state.lastHumanAt.getTime()) / DAY_MS;
  if (idleDays < FIRST_REMINDER_DAYS) return { kind: IdleWake.Normal, at: null };
  const stale = state.remindedAt === null || state.remindedAt < state.lastHumanAt;
  const reminders = stale ? 0 : state.reminders;
  if (reminders === 0) {
    return { kind: IdleWake.Reminder, at: after(state.lastHumanAt, SECOND_REMINDER_DAYS) };
  }
  if (reminders === 1) {
    return idleDays < SECOND_REMINDER_DAYS
      ? { kind: IdleWake.NotYet, at: after(state.lastHumanAt, SECOND_REMINDER_DAYS) }
      : { kind: IdleWake.Reminder, at: after(state.lastHumanAt, CLOSE_QUESTION_DAYS) };
  }
  if (reminders === 2) {
    return idleDays < CLOSE_QUESTION_DAYS
      ? { kind: IdleWake.NotYet, at: after(state.lastHumanAt, CLOSE_QUESTION_DAYS) }
      : { kind: IdleWake.CloseQuestion, at: after(now, QUIET_DAYS) };
  }
  return { kind: IdleWake.NotYet, at: after(state.remindedAt ?? now, QUIET_DAYS) };
}

/** The goal's idle state, read from the conversation and its asks. Null when unreadable. */
export async function idleState(taskId: number): Promise<IdleState | null> {
  const result = await query<{
    last_human_at: Date;
    idle_reminders: number;
    idle_reminded_at: Date | null;
  }>(
    `SELECT GREATEST(
              t.created_at,
              (SELECT MAX(c.created_at) FROM conversations c
                WHERE c.thread_id = t.thread_id AND c.role = 'user' AND c.kind = 'message'),
              (SELECT MAX(a.answered_at) FROM task_asks a WHERE a.task_id = t.id)
            ) AS last_human_at,
            t.idle_reminders, t.idle_reminded_at
       FROM tasks t WHERE t.id = $1 LIMIT 1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    lastHumanAt: new Date(row.last_human_at),
    reminders: row.idle_reminders,
    remindedAt: row.idle_reminded_at === null ? null : new Date(row.idle_reminded_at),
  };
}

/** Counts a reminder; the count starts again whenever a person has written since the last one. */
export async function noteIdleReminder(taskId: number, state: IdleState): Promise<void> {
  const stale = state.remindedAt === null || state.remindedAt < state.lastHumanAt;
  await query(
    'UPDATE tasks SET idle_reminders = $2, idle_reminded_at = NOW() WHERE id = $1',
    [taskId, (stale ? 0 : state.reminders) + 1],
    QUERY_TIMEOUT_MS,
  );
}

/** Puts the goal's next wake at `at`, whatever the run set. */
export async function setIdleWake(taskId: number, at: Date): Promise<void> {
  await query(
    `UPDATE tasks SET next_wake_at = $2 WHERE id = $1 AND status = 'open'`,
    [taskId, at],
    QUERY_TIMEOUT_MS,
  );
}

/** The line the five-day wake carries: one question, then quiet. */
export const CLOSE_QUESTION_NOTE =
  'ამ მიზანში ერთი კვირაა არავის არაფერი დაუწერია. მფლობელს ერთხელ, მოკლედ ჰკითხე: ' +
  'გავაგრძელოთ, შევცვალოთ თუ დავხუროთ — და მეტი შეხსენება აღარ გააკეთო, სანამ არ გიპასუხებს.';

/** K9 audit B11 (session 3): with an approved plan, its next step comes before the question. */
export const CLOSE_QUESTION_NOTE_WITH_PLAN =
  'ამ მიზანში ერთი კვირაა არავის არაფერი დაუწერია. თუ დამტკიცებულ გეგმას შემდეგი ნაბიჯი ' +
  'აქვს — ის ახლავე გააკეთე და მფლობელს ერთი ხაზით უთხარი. მხოლოდ თუ ნაბიჯები ამოიწურა, ' +
  'ჰკითხე ერთხელ: გავაგრძელოთ ახალი გზით თუ დავხუროთ.';

export function closeQuestionNote(planApproved: boolean): string {
  return planApproved ? CLOSE_QUESTION_NOTE_WITH_PLAN : CLOSE_QUESTION_NOTE;
}
