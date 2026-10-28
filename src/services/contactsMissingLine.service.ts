import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';
import { recordProductEvent } from './productEvents.service';
import { isQuietHour } from './pushQuietHours';
import { RunLanguage } from './runLanguage';
import { emitMessageAppended } from './sse.service';
import { notATestSeat } from './testSeatCreate.service';
import { getOrCreateDefaultThread, saveServerLine, userLanguage } from './threads.service';

/**
 * #7757 / #7828, Misho 27 Oct („შენი შეთავაზება გააკეთე"): the missing-step
 * nudge is split by who can act on it. Notifications and the home screen are
 * an app card (GET /setup/missing; the app acts on a tap). Contacts, the one
 * step everything else waits on, is a line from Netai in the person's main
 * chat, once: before an import Netai can search nobody's circle.
 */
const QUERY_TIMEOUT_MS = 8_000;
/** Long enough after registering for the setup screens to have had their turn. */
const AFTER_HOURS = 3;
/** And not for an account that has gone quiet for good. */
const WITHIN_DAYS = 14;
const MAX_PER_RUN = 50;
/** The on-demand run takes a few fictional seats, never a sweep. */
export const MAX_CONTACTS_LINE_SEATS = 10;
const DAY_ZONE = 'Asia/Tbilisi';
export const CONTACTS_MISSING_EVENT = 'contacts_missing_line';

export const CONTACTS_MISSING_LINE: Readonly<Record<RunLanguage, string>> = {
  ka:
    'შენი კონტაქტები ჯერ არ ატვირთულა. სანამ არ ატვირთავ, შენს წრეში ვერავის მოვძებნი და ' +
    'ვერავის ვკითხავ. ატვირთე და მაშინვე დავიწყებ.',
  en:
    "Your contacts aren't uploaded yet. Until they are, I can't search your circle or ask " +
    'anyone in it. Upload them and I will start at once.',
  ru:
    'Твои контакты ещё не загружены. Пока их нет, я не могу искать в твоём круге и никого ' +
    'спросить. Загрузи их, и я сразу начну.',
  es:
    'Tus contactos aún no están subidos. Hasta entonces no puedo buscar en tu círculo ni ' +
    'preguntar a nadie. Súbelos y empiezo enseguida.',
};

/** Netai registrants AFTER_HOURS–WITHIN_DAYS in, who never imported and never got this line. */
export async function peopleWithoutContacts(): Promise<number[]> {
  const result = await query<{ user_id: number }>(
    `SELECT u.id AS user_id FROM "User" u
      WHERE u."hasAccessToAlly" = true
        AND u."deletedAt" IS NULL
        AND u."createdAt" <= NOW() - make_interval(hours => $1)
        AND u."createdAt" > NOW() - make_interval(days => $2)
        AND ${notATestSeat('u.id')}
        AND NOT EXISTS (SELECT 1 FROM import_attempts ia
                         WHERE ia.user_id = u.id AND ia.imported > 0)
        AND NOT EXISTS (SELECT 1 FROM "UserAlias" ua WHERE ua."contactId" = u.id)
        AND NOT EXISTS (SELECT 1 FROM product_events e
                         WHERE e.event = $3 AND e.user_id::text = u.id::text)
      ORDER BY u."createdAt"
      LIMIT $4`,
    [AFTER_HOURS, WITHIN_DAYS, CONTACTS_MISSING_EVENT, MAX_PER_RUN],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => row.user_id);
}

/** The line for one person, in their main chat, with a push that opens it. Recorded first. */
export async function tellContactsMissing(userId: number): Promise<void> {
  const owner = String(userId);
  const threadId = await getOrCreateDefaultThread(owner);
  await recordProductEvent(userId, CONTACTS_MISSING_EVENT, { thread_id: threadId });
  const language = await userLanguage(owner).catch(() => 'ka' as RunLanguage);
  const line = CONTACTS_MISSING_LINE[language] ?? CONTACTS_MISSING_LINE.ka;
  const saved = await saveServerLine(threadId, userId, line);
  emitMessageAppended(owner, threadId, randomUUID(), {
    messageId: String(saved.id),
    kind: 'pending',
    content: saved.content,
    choices: [],
    ref: { kind: CONTACTS_MISSING_EVENT },
    createdAt: saved.createdAt,
  });
  void sendPushNotification(owner, {
    title: 'Netai',
    body: line,
    url: `/chat/${threadId}`,
  }).catch(() => undefined);
}

/** One run, never in quiet hours. Returns how many were told. */
export async function runContactsMissingLines(now: Date = new Date()): Promise<number> {
  if (isQuietHour(now, DAY_ZONE)) return 0;
  let told = 0;
  for (const userId of await peopleWithoutContacts()) {
    try {
      await tellContactsMissing(userId);
      told += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[contacts-missing] user ${userId}:`, (err as Error).message);
    }
  }
  return told;
}

export enum ContactsLineSeatOutcome {
  BadInput = 'bad_input',
  NotATestSeat = 'not_a_test_seat',
  Ran = 'ran',
}

async function allAreTestSeats(userIds: readonly number[]): Promise<boolean> {
  const result = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM test_seats WHERE user_id = ANY($1::int[])`,
    [userIds],
    QUERY_TIMEOUT_MS,
  );
  return (result.rows[0]?.n ?? 0) === userIds.length;
}

/** #7828 (tester, 28 Oct): „never twice" holds on seats too — the ones already told. */
async function toldAlready(userIds: readonly number[]): Promise<ReadonlySet<number>> {
  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT user_id::int AS user_id FROM product_events
      WHERE event = $1 AND user_id::text = ANY($2::text[])`,
    [CONTACTS_MISSING_EVENT, userIds.map(String)],
    QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((row) => row.user_id));
}

/** The line, now, on fictional seats only, so the tester reads it today. Never twice. */
export async function runContactsMissingForSeats(
  seatIds: readonly number[],
): Promise<{ readonly outcome: ContactsLineSeatOutcome; readonly told: number }> {
  const unique = [...new Set(seatIds)];
  if (unique.length === 0 || unique.length > MAX_CONTACTS_LINE_SEATS) {
    return { outcome: ContactsLineSeatOutcome.BadInput, told: 0 };
  }
  if (!(await allAreTestSeats(unique))) {
    return { outcome: ContactsLineSeatOutcome.NotATestSeat, told: 0 };
  }
  const alreadyTold = await toldAlready(unique);
  let told = 0;
  for (const seatId of unique.filter((id) => !alreadyTold.has(id))) {
    try {
      await tellContactsMissing(seatId);
      told += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[contacts-missing] seat ${seatId}:`, (err as Error).message);
    }
  }
  return { outcome: ContactsLineSeatOutcome.Ran, told };
}
