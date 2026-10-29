import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { processChat } from './chat.service';
import { factsAboutMe } from './factsAboutMe.service';
import { indexOffers, sureOffersFor } from './matchIndex';
import { sendPushNotification } from './notification.service';
import { recordProductEvent } from './productEvents.service';
import { emitRunComplete } from './sse.service';
import { allAreTestSeats, notATestSeat } from './testSeatCreate.service';
import { getOrCreateDefaultThread } from './threads.service';

/**
 * #7729 / #7828 / #7757 (Misho's „კი", 27 Oct ~11:50Z): within the hour after
 * a person registers, Netai writes them ONE first message in their main chat:
 * a real need another member has that fits the joiner's own work, and the
 * invite ask. A push opens that chat. Never a second one.
 *
 * ANONYMOUS UNTIL BOTH CONSENT. The model is told only the FIELD the need is
 * in, taken from the joiner's own facts — never the goal's words, its owner or
 * anybody named in it — so nothing in the message can point at the asker.
 * The words themselves are the shared prompt's (the prompt chat's), written
 * from the server event below.
 */
const QUERY_TIMEOUT_MS = 8_000;
/** Registered at least this long ago, so registration research has had its turn. */
const SETTLE_MINUTES = 15;
/** And at most this long ago: „within the hour", with one more for a restart. */
const WITHIN_MINUTES = 120;
const MAX_PER_RUN = 20;
/** The joiner's own fact fields that say what they work in. */
const WORK_FIELDS: ReadonlySet<string> = new Set([
  'occupation',
  'employer',
  'industry',
  'expertise',
  'headline',
  'other_role',
]);
const OPEN_GOALS_READ = 2_000;
const PUSH_BODY_CHARS = 140;
export const JOINER_FIRST_MESSAGE_EVENT = 'joiner_first_message';

/** What the model is told when a fitting need was found. Only the field; nothing of the goal. */
export function joinerEventBody(field: string | null): string {
  const need =
    field === null
      ? 'ამ წუთას ზუსტად მისთვის შესაფერისი საჭიროება ვერ ვიპოვე — ეს არ თქვა, უბრალოდ გამოტოვე.'
      : `ერთ-ერთ წევრს ახლა სჭირდება ადამიანი ამ სფეროდან: „${field}". ეს ახალი წევრის საკუთარი ` +
        'სფეროა. თქვი, რომ ასეთი საჭიროება არსებობს, და ჰკითხე, შეუძლია თუ არა დახმარება. ' +
        'ვინ არის ის წევრი, რა უწერია ან ვინ ახსენა — არ იცი და არ თქვა: ორივე მხარე უნდა დათანხმდეს.';
  return (
    'ეს ადამიანი ახლახან შემოვიდა Netai-ზე და ეს მისი პირველი შეტყობინებაა Netai-სგან. დაწერე ' +
    `ერთი მოკლე, თბილი შეტყობინება. ${need} ბოლოს სთხოვე, მოიწვიოს ერთი-ორი ახლობელი, ვისაც ` +
    'Netai გამოადგება (მოსაწვევი ბმული get_invite_link-ით). არაფერი მოძებნო და არავის მისწერო.'
  );
}

interface Joiner {
  readonly user_id: number;
}

/** Real people who registered on Netai SETTLE–WITHIN minutes ago and have had no first message. */
export async function joinersDue(): Promise<number[]> {
  const result = await query<Joiner>(
    `SELECT u.id AS user_id FROM "User" u
      WHERE u."createdAt" > NOW() - make_interval(mins => $1)
        AND u."createdAt" <= NOW() - make_interval(mins => $2)
        -- Registered through Netai (registerUser sets it); old-app sign-ups
        -- keep arriving in "User" too and never opened Netai.
        AND u."hasAccessToAlly" = true
        AND ${notATestSeat('u.id')}
        AND NOT EXISTS (
              SELECT 1 FROM product_events e
               WHERE e.event = $3 AND e.user_id::text = u.id::text)
      ORDER BY u."createdAt"
      LIMIT $4`,
    [WITHIN_MINUTES, SETTLE_MINUTES, JOINER_FIRST_MESSAGE_EVENT, MAX_PER_RUN],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => row.user_id);
}

/** The joiner's own work fields, as an offer would carry them. */
export async function joinerWorkFields(userId: number): Promise<string[]> {
  const facts = await factsAboutMe(userId);
  return [
    ...new Set(facts.filter((f) => WORK_FIELDS.has(f.field)).map((f) => f.value.trim())),
  ].filter((value) => value !== '');
}

/**
 * The first of the joiner's fields that another member's open goal names
 * (the matcher's own sure-match rule, matchIndex). Null when none does.
 */
export async function fittingField(
  userId: number,
  fields: readonly string[],
): Promise<string | null> {
  if (fields.length === 0) return null;
  const goals = await query<{ id: number; user_id: number; title: string }>(
    `SELECT id, user_id::int AS user_id, title FROM tasks
      WHERE status = 'open' AND title IS NOT NULL AND user_id <> $1::text
      ORDER BY id DESC LIMIT $2`,
    [String(userId), OPEN_GOALS_READ],
    QUERY_TIMEOUT_MS,
  );
  const index = indexOffers(fields.map((field, i) => ({ id: i, user_id: userId, field })));
  for (const goal of goals.rows) {
    const [fits] = sureOffersFor(goal, index);
    if (fits !== undefined) return fits.field;
  }
  return null;
}

/** Writes one joiner's first message. Recorded before the run, so it can never go twice. */
export async function sendJoinerFirstMessage(userId: number): Promise<boolean> {
  const owner = String(userId);
  const field = await fittingField(userId, await joinerWorkFields(userId));
  const threadId = await getOrCreateDefaultThread(owner);
  await recordProductEvent(userId, JOINER_FIRST_MESSAGE_EVENT, {
    thread_id: threadId,
    fitting_need: field !== null,
  });
  const runId = randomUUID();
  const result = await processChat(owner, threadId, `[მოვლენა] ${joinerEventBody(field)}`, runId);
  if (result.runFailed === true || result.reply.trim() === '') return false;
  emitRunComplete(owner, threadId, runId, { reply: result.reply });
  void sendPushNotification(owner, {
    title: 'Netai',
    body: result.reply.slice(0, PUSH_BODY_CHARS),
    url: `/chat/${threadId}`,
  }).catch(() => undefined);
  return true;
}

/** One run: each due joiner gets their first message. Returns how many were written. */
export async function runJoinerFirstMessages(): Promise<number> {
  let sent = 0;
  for (const userId of await joinersDue()) {
    try {
      if (await sendJoinerFirstMessage(userId)) sent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[joiner-first] user ${userId}:`, (err as Error).message);
    }
  }
  return sent;
}

/** The on-demand run takes a few fictional seats, never a sweep. */
export const MAX_JOINER_SEATS = 10;

export enum JoinerSeatOutcome {
  BadInput = 'bad_input',
  NotATestSeat = 'not_a_test_seat',
  Ran = 'ran',
}

/** The seats already given their first message: never twice, on seats too. */
async function seatsAlreadyWelcomed(userIds: readonly number[]): Promise<ReadonlySet<number>> {
  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT user_id::int AS user_id FROM product_events
      WHERE event = $1 AND user_id::text = ANY($2::text[])`,
    [JOINER_FIRST_MESSAGE_EVENT, userIds.map(String)],
    QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((row) => row.user_id));
}

/**
 * Plate v538 (#7729 / #7828): the hourly run skips test seats, so the tester
 * could not see the first message at all. On fictional seats only, now, never
 * twice, the same message a real joiner gets.
 */
export async function runJoinerFirstMessagesForSeats(
  seatIds: readonly number[],
): Promise<{ readonly outcome: JoinerSeatOutcome; readonly sent: number }> {
  const unique = [...new Set(seatIds)];
  if (unique.length === 0 || unique.length > MAX_JOINER_SEATS) {
    return { outcome: JoinerSeatOutcome.BadInput, sent: 0 };
  }
  if (!(await allAreTestSeats(unique))) return { outcome: JoinerSeatOutcome.NotATestSeat, sent: 0 };
  const welcomed = await seatsAlreadyWelcomed(unique);
  let sent = 0;
  for (const seatId of unique.filter((id) => !welcomed.has(id))) {
    try {
      if (await sendJoinerFirstMessage(seatId)) sent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[joiner-first] seat ${seatId}:`, (err as Error).message);
    }
  }
  return { outcome: JoinerSeatOutcome.Ran, sent };
}
