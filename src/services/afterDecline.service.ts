import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { processChat } from './chat.service';
import { sendPushNotification } from './notification.service';
import { recordProductEvent } from './productEvents.service';
import { emitRunComplete, emitThreadCreated } from './sse.service';
import { notATestSeat } from './testSeatCreate.service';
import { createThread } from './threads.service';

/**
 * #8086 (#7661 part 1, founder 25 Oct, W7): when a helper declines an ask —
 * „არა", „არ ვიცნობ" — nothing happened with that helper afterwards. The rule:
 * never ask them again in that goal (the declined-recently guard already holds
 * that), and a day later open ONE new conversation with them that thanks them,
 * says honestly that it did not work out, and asks about their OWN goal.
 *
 * The model writes the line, with the shared prompt, as a server event in the
 * new conversation; it is given nothing from the asker's goal, so no name or
 * detail of it can reach the helper.
 */
const QUERY_TIMEOUT_MS = 5_000;
/** A decline at least a day old and at most two: „the day after". */
const DECLINED_FROM_HOURS = 48;
const DECLINED_UNTIL_HOURS = 24;
/** One such conversation per person per week. */
const ONCE_PER_DAYS = 7;
/** A run opens at most this many, so a day with many declines cannot flood anyone's evening. */
const MAX_PER_RUN = 30;
const DAY_ZONE = 'Asia/Tbilisi';
const START_OF_TODAY_SQL = `(date_trunc('day', NOW() AT TIME ZONE '${DAY_ZONE}') AT TIME ZONE '${DAY_ZONE}')`;
export const AFTER_DECLINE_EVENT = 'after_decline_opened';
const THREAD_TITLE = 'Netai';
/** The push shows the start of the line. */
const PUSH_BODY_CHARS = 140;

/** What the model is told in the new conversation. Nothing from the asker's goal is in it. */
export const AFTER_DECLINE_EVENT_BODY =
  'ეს ახალი საუბარია, Netai-მ თვითონ გახსნა. ახლახან ამ ადამიანმა სხვის კითხვას უპასუხა, რომ ' +
  'ვერ დაეხმარება (არ იცნობს ან უარი თქვა). დაწერე ერთი მოკლე პირველი შეტყობინება: მადლობა ' +
  'პასუხისთვის; ერთი გულწრფელი ხაზი, რომ ის კითხვა ამჯერად არ გამოვიდა და ეს არაუშავს — იმ ' +
  'საქმიდან არც ერთი სახელი და არც ერთი დეტალი; და ერთი კითხვა მის საკუთარ საქმეზე („რაზე ' +
  'მუშაობ ახლა, რაში შემიძლია დაგეხმარო?"). არაფერი მოძებნო, არავის მისწერო, მიზანი არ გახსნა.';

/** Every member when null; otherwise only these test seats (the on-demand run). */
type HelperScope = readonly number[] | null;

/**
 * Helpers whose decline is a day old, who were not opened such a conversation
 * this week, and who got no new conversation from Netai today; real members
 * only. The on-demand run takes the named test seats with any decline, so the
 * tester reads the conversation today, not tomorrow.
 */
export async function helpersDueAfterDecline(scope: HelperScope): Promise<number[]> {
  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT a.to_user_id::int AS user_id
       FROM task_asks a
      WHERE a.declined_at IS NOT NULL
        AND a.to_user_id IS NOT NULL
        AND ($1::int[] IS NULL OR a.to_user_id::int = ANY($1::int[]))
        AND ($1::int[] IS NOT NULL OR (
              a.declined_at > NOW() - make_interval(hours => $2)
          AND a.declined_at <= NOW() - make_interval(hours => $3)
          AND ${notATestSeat('a.to_user_id')}
          AND NOT EXISTS (
                SELECT 1 FROM product_events e
                 WHERE e.event = $4 AND e.user_id::text = a.to_user_id::text
                   AND e.created_at > NOW() - make_interval(days => $5))
          AND NOT EXISTS (
                SELECT 1 FROM threads t
                 WHERE t.user_id::text = a.to_user_id::text
                   AND t.created_at >= ${START_OF_TODAY_SQL})))
      LIMIT $6`,
    [
      scope,
      DECLINED_FROM_HOURS,
      DECLINED_UNTIL_HOURS,
      AFTER_DECLINE_EVENT,
      ONCE_PER_DAYS,
      MAX_PER_RUN,
    ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => row.user_id);
}

/** Opens the conversation for one helper and lets the model write its first line. */
export async function openAfterDecline(userId: number): Promise<boolean> {
  const owner = String(userId);
  const thread = await createThread(owner, 'regular', THREAD_TITLE);
  // Recorded before the run, so a run that dies cannot make the next tick open a second one.
  await recordProductEvent(userId, AFTER_DECLINE_EVENT, { thread_id: thread.id });
  emitThreadCreated(owner, {
    id: thread.id,
    type: thread.type,
    title: thread.title,
    is_task: thread.is_task,
    status: thread.status,
    status_line: thread.status_line,
  });
  const runId = randomUUID();
  const result = await processChat(
    owner,
    thread.id,
    `[მოვლენა] ${AFTER_DECLINE_EVENT_BODY}`,
    runId,
  );
  if (result.runFailed === true || result.reply.trim() === '') return false;
  emitRunComplete(owner, thread.id, runId, { reply: result.reply });
  void sendPushNotification(owner, {
    title: 'Netai',
    body: result.reply.slice(0, PUSH_BODY_CHARS),
    url: `/chat/${thread.id}`,
  }).catch(() => undefined);
  return true;
}

/** One run: every due helper gets one conversation. Returns how many were opened. */
export async function runAfterDecline(scope: HelperScope = null): Promise<number> {
  let opened = 0;
  for (const userId of await helpersDueAfterDecline(scope)) {
    try {
      if (await openAfterDecline(userId)) opened += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[after-decline] user ${userId}:`, (err as Error).message);
    }
  }
  return opened;
}

export enum SeatRunOutcome {
  BadInput = 'bad_input',
  NotATestSeat = 'not_a_test_seat',
  Ran = 'ran',
}

/** The on-demand run takes a few seats, never a sweep. */
export const MAX_SEATS_PER_RUN = 10;

/** #8086 (tester): the day-after conversation now, on fictional seats only. */
export async function runAfterDeclineForSeats(
  seatIds: readonly number[],
): Promise<{ readonly outcome: SeatRunOutcome; readonly opened: number }> {
  const unique = [...new Set(seatIds)];
  if (unique.length === 0 || unique.length > MAX_SEATS_PER_RUN) {
    return { outcome: SeatRunOutcome.BadInput, opened: 0 };
  }
  const seats = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM test_seats WHERE user_id = ANY($1::int[])`,
    [unique],
    QUERY_TIMEOUT_MS,
  );
  if ((seats.rows[0]?.n ?? 0) !== unique.length) {
    return { outcome: SeatRunOutcome.NotATestSeat, opened: 0 };
  }
  return { outcome: SeatRunOutcome.Ran, opened: await runAfterDecline(unique) };
}
