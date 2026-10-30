import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { processChat } from './chat.service';
import { factsAboutMe } from './factsAboutMe.service';
import {
  JOINER_FIRST_MESSAGE_EVENT,
  joinerRulesEventBody,
  mostImportantMissingStep,
  researchedWorkFact,
} from './joinerBrief';
import { indexOffers, sureOffersFor } from './matchIndex';
import { sendPushNotification } from './notification.service';
import { recordProductEvent } from './productEvents.service';
import { missingSteps } from './setupState.service';
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
export { JOINER_FIRST_MESSAGE_EVENT };

/** Which text a joiner's first message is written from. */
export enum JoinerText {
  /** A fitting member need, anonymously, and the invite (Misho's „კი", 27 Oct). */
  MatchedNeed = 'matched_need',
  /** The founder's four rules (box 78825, 30 Oct). */
  FoundersRules = 'founders_rules',
}

/**
 * The founder's rules are new model-facing text that real joiners would read
 * (D44): fictional seats get them first, for the tester's ten runs, and real
 * joiners keep the matched-need text until Misho's own yes.
 */
const REAL_JOINER_TEXT = JoinerText.MatchedNeed;
const SEAT_JOINER_TEXT = JoinerText.FoundersRules;

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

/**
 * Tester 78972 (30 Oct, seat 199048): a deploy cut the first message's run
 * thirty seconds in. The event is recorded before the run so it never goes
 * twice, and so a cut run left the person with no first message, for good.
 * An attempt that produced no reply in its thread within RETRY_AFTER_MINUTES
 * is tried once more; a second attempt is the last.
 */
const RETRY_AFTER_MINUTES = 10;
const MAX_ATTEMPTS = 2;

/** SQL: this account ($u) has had its first message, or one is still in flight, or both tries are spent. */
function welcomedSql(
  account: string,
  eventParam: string,
  retryParam: string,
  maxParam: string,
): string {
  return `(
    (SELECT count(*) FROM product_events a
      WHERE a.event = ${eventParam} AND a.user_id::text = ${account}) >= ${maxParam}
    OR EXISTS (
      SELECT 1 FROM product_events e
       WHERE e.event = ${eventParam} AND e.user_id::text = ${account}
         AND (e.created_at > NOW() - make_interval(mins => ${retryParam})
              OR EXISTS (
                SELECT 1 FROM conversations c
                 WHERE c.thread_id = (e.props->>'thread_id')::int
                   AND c.role = 'assistant' AND c.kind = 'message' AND c.content <> ''
                   AND c.created_at > e.created_at))))`;
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
        AND NOT ${welcomedSql('u.id::text', '$3', '$5', '$6')}
      ORDER BY u."createdAt"
      LIMIT $4`,
    [
      WITHIN_MINUTES,
      SETTLE_MINUTES,
      JOINER_FIRST_MESSAGE_EVENT,
      MAX_PER_RUN,
      RETRY_AFTER_MINUTES,
      MAX_ATTEMPTS,
    ],
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

interface JoinerEvent {
  readonly body: string;
  readonly props: Readonly<Record<string, unknown>>;
}

/** The event for the matched-need text: only the field a need is in, nothing of the goal. */
async function matchedNeedEvent(userId: number): Promise<JoinerEvent> {
  const field = await fittingField(userId, await joinerWorkFields(userId));
  return { body: joinerEventBody(field), props: { fitting_need: field !== null } };
}

/** The event for the founder's rules: one researched fact, and the one missing step. */
async function foundersRulesEvent(userId: number): Promise<JoinerEvent> {
  const workFact = researchedWorkFact(await factsAboutMe(userId));
  const missingStep = mostImportantMissingStep(await missingSteps(userId));
  return {
    body: joinerRulesEventBody({ workFact, missingStep }),
    props: { work_fact: workFact !== null, missing_step: missingStep },
  };
}

/** Writes one joiner's first message. Recorded before the run, so it can never go twice. */
export async function sendJoinerFirstMessage(userId: number, text: JoinerText): Promise<boolean> {
  const owner = String(userId);
  const event =
    text === JoinerText.FoundersRules
      ? await foundersRulesEvent(userId)
      : await matchedNeedEvent(userId);
  const threadId = await getOrCreateDefaultThread(owner);
  await recordProductEvent(userId, JOINER_FIRST_MESSAGE_EVENT, {
    thread_id: threadId,
    text,
    ...event.props,
  });
  const runId = randomUUID();
  const result = await processChat(owner, threadId, `[მოვლენა] ${event.body}`, runId);
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
      if (await sendJoinerFirstMessage(userId, REAL_JOINER_TEXT)) sent += 1;
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
    `SELECT s.id::int AS user_id FROM unnest($2::text[]) AS s(id)
      WHERE ${welcomedSql('s.id', '$1', '$3', '$4')}`,
    [JOINER_FIRST_MESSAGE_EVENT, userIds.map(String), RETRY_AFTER_MINUTES, MAX_ATTEMPTS],
    QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((row) => row.user_id));
}

/**
 * Plate v538 (#7729 / #7828): the hourly run skips test seats, so the tester
 * could not see the first message at all. On fictional seats only, now, never
 * twice. Since 30 Oct the seats get the founder's rules ahead of real joiners
 * (SEAT_JOINER_TEXT).
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
      if (await sendJoinerFirstMessage(seatId, SEAT_JOINER_TEXT)) sent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[joiner-first] seat ${seatId}:`, (err as Error).message);
    }
  }
  return { outcome: JoinerSeatOutcome.Ran, sent };
}
