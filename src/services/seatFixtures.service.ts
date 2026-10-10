import { query } from '../db/postgres/client';
import { askField } from './answerStats.service';
import { FACT_FIELD_TYPES } from './contactFacts.service';
import { normalizePhone, phoneDigits } from './phone';

/**
 * Tester 49567 (rule B, 9 Oct): two plate rows wait on state no chat can make
 * on a fresh seat — a fact older than 180 days (1690's confirm at the moment
 * of use) and a candidate's answer record (1691's wave order). Both are
 * written on FICTIONAL seats only; any other account is refused before
 * anything is read about it.
 */
const QUERY_TIMEOUT_MS = 5_000;

/** 1690 asks after 180 days; the fixture may go back up to ten years. */
export const MIN_DAYS_AGO = 1;
export const MAX_DAYS_AGO = 3_650;
const MAX_FACT_CHARS = 200;
const MAX_STAT = 10_000;
const MAX_PROFILE_CHARS = 120;

export enum FixtureOutcome {
  Written = 'written',
  NotATestSeat = 'not_a_test_seat',
  NotTheSeatsContact = 'not_the_seats_contact',
  BadInput = 'bad_input',
}

async function isTestSeat(userId: number): Promise<boolean> {
  const result = await query<{ user_id: number }>(
    `SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

async function seatSavedThisNumber(seatId: number, phone: string): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM "UserAlias" WHERE "contactId" = $1 AND phone = $2) AS found`,
    [seatId, phone],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

export interface StaleFactInput {
  readonly phone: string;
  readonly fieldType: string;
  readonly value: string;
  readonly daysAgo: number;
}

/** 1690: one of the seat's own facts about its contact, saved `daysAgo` days back. */
export async function writeStaleFact(
  seatId: number,
  input: StaleFactInput,
): Promise<FixtureOutcome> {
  const value = input.value.trim().slice(0, MAX_FACT_CHARS);
  if (
    !(FACT_FIELD_TYPES as readonly string[]).includes(input.fieldType) ||
    value === '' ||
    !Number.isInteger(input.daysAgo) ||
    input.daysAgo < MIN_DAYS_AGO ||
    input.daysAgo > MAX_DAYS_AGO
  ) {
    return FixtureOutcome.BadInput;
  }
  if (!(await isTestSeat(seatId))) return FixtureOutcome.NotATestSeat;
  const phone = normalizePhone(input.phone);
  if (!(await seatSavedThisNumber(seatId, phone))) return FixtureOutcome.NotTheSeatsContact;
  await query(
    `INSERT INTO contact_facts
       (neo4j_contact_id, submitted_by_user_id, field_type, value, is_public, source, confidence,
        is_matchable, created_at, updated_at)
     VALUES ($1, $2, $3, $4, false, 'chat', 'stated', true,
             NOW() - make_interval(days => $5), NOW() - make_interval(days => $5))
     ON CONFLICT (neo4j_contact_id, submitted_by_user_id, field_type)
       WHERE field_type IN ('occupation', 'employer', 'city', 'industry')
     DO UPDATE SET value = $4, created_at = NOW() - make_interval(days => $5),
                   updated_at = NOW() - make_interval(days => $5), retracted_at = NULL,
                   last_confirmed_at = NULL, confirmed_by_result_at = NULL, confirm_asked_at = NULL`,
    [phone, String(seatId), input.fieldType, value, input.daysAgo],
    QUERY_TIMEOUT_MS,
  );
  return FixtureOutcome.Written;
}

export interface AnswerRecordInput {
  /** The goal as the tester will type it; filed under the same field an ask would be. */
  readonly goalText: string | null;
  /**
   * The tester's 49931 / ops 02:36Z: or the goal itself, once it exists. Its
   * asks file under its title, which the model wrote and the tester's typed
   * text may not match; so the record goes under the title's own field.
   */
  readonly taskId: number | null;
  readonly asked: number;
  readonly yes: number;
  readonly no: number;
  readonly referred: number;
  readonly firstAnswerMinutesMedian: number | null;
}

function isCount(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_STAT;
}

/** The title of a goal on a fictional seat; null for any other goal. */
async function testSeatGoalTitle(taskId: number): Promise<string | null> {
  const result = await query<{ title: string }>(
    `SELECT t.title FROM tasks t JOIN test_seats ts ON ts.user_id::text = t.user_id
      WHERE t.id = $1 LIMIT 1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.title ?? null;
}

/** The text the record's field is taken from; null when the goal is not a fictional seat's. */
async function recordGoalText(input: AnswerRecordInput): Promise<string | null> {
  if (input.taskId !== null) return testSeatGoalTitle(input.taskId);
  return input.goalText;
}

/**
 * 1691: the seat's answer record in the field the goal files under, set
 * exactly. The recount rebuilds it from real asks once the seat is asked, so
 * the ranking is read before the plan is approved (GET wave-ranking).
 */
export async function writeAnswerRecord(
  seatId: number,
  input: AnswerRecordInput,
): Promise<FixtureOutcome> {
  if (input.taskId !== null && !(Number.isInteger(input.taskId) && input.taskId > 0)) {
    return FixtureOutcome.BadInput;
  }
  const goalText = await recordGoalText(input);
  if (goalText === null) {
    return input.taskId === null ? FixtureOutcome.BadInput : FixtureOutcome.NotATestSeat;
  }
  const field = askField(goalText);
  const counts = [input.asked, input.yes, input.no, input.referred];
  const minutes = input.firstAnswerMinutesMedian;
  if (
    field === '' ||
    !counts.every(isCount) ||
    input.yes + input.no + input.referred > input.asked ||
    (minutes !== null && !(minutes >= 0 && minutes <= MAX_STAT))
  ) {
    return FixtureOutcome.BadInput;
  }
  if (!(await isTestSeat(seatId))) return FixtureOutcome.NotATestSeat;
  await query(
    `INSERT INTO answer_stats (user_id, field, asked, yes, no, referred, later, silent,
                               first_answer_minutes_median, helped, bridged, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, 0, 0, NOW())
     ON CONFLICT (user_id, field) DO UPDATE
       SET asked = $3, yes = $4, no = $5, referred = $6, first_answer_minutes_median = $7,
           updated_at = NOW()`,
    [seatId, field, input.asked, input.yes, input.no, input.referred, minutes],
    QUERY_TIMEOUT_MS,
  );
  return FixtureOutcome.Written;
}

export interface OldProfileInput {
  /** The contact's number as the seat saved it; its account must be a fictional seat too. */
  readonly phone: string;
  readonly employer: string;
  readonly jobPosition: string;
}

/** The fictional seat that holds this number, if one does; a real account never matches. */
async function fictionalAccountOf(phone: string): Promise<number | null> {
  const digits = phoneDigits(phone);
  if (digits === '') return null;
  const result = await query<{ user_id: number }>(
    `SELECT up."userId" AS user_id FROM "UserPhone" up
       JOIN test_seats ts ON ts.user_id = up."userId"
      WHERE up.phone = ANY($1::text[])
      LIMIT 1`,
    [[`+${digits}`, digits]],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.user_id ?? null;
}

/**
 * 4226 (the tester's 49805): a contact with an old Ally profile — employer and
 * job title on the contact's own account — so the owner's corrected word can
 * be seen winning over it. Written only when the contact's account is itself
 * a fictional seat; a real person's profile is never touched.
 */
export async function writeOldProfile(
  seatId: number,
  input: OldProfileInput,
): Promise<FixtureOutcome> {
  const employer = input.employer.trim().slice(0, MAX_PROFILE_CHARS);
  const jobPosition = input.jobPosition.trim().slice(0, MAX_PROFILE_CHARS);
  if (employer === '' && jobPosition === '') return FixtureOutcome.BadInput;
  if (!(await isTestSeat(seatId))) return FixtureOutcome.NotATestSeat;
  const phone = normalizePhone(input.phone);
  if (!(await seatSavedThisNumber(seatId, phone))) return FixtureOutcome.NotTheSeatsContact;
  const contactId = await fictionalAccountOf(phone);
  if (contactId === null || contactId === seatId) return FixtureOutcome.NotATestSeat;
  await query(
    `UPDATE "User" SET employer = NULLIF($2, ''), "jobPosition" = NULLIF($3, '')
      WHERE id = $1 AND EXISTS (SELECT 1 FROM test_seats WHERE user_id = $1)`,
    [contactId, employer, jobPosition],
    QUERY_TIMEOUT_MS,
  );
  return FixtureOutcome.Written;
}

/** The longest summary a due-update fixture carries, as the card's detail line. */
const DUE_UPDATE_SUMMARY_MAX = 200;

/**
 * 0073 (ops 11:00Z, the tester's question 4): a test seat with nothing due
 * cannot check that `/updates/count`'s lines match `GET /updates`. One „found"
 * update on the seat's own goal, due now — the same row a search result
 * queues, shown in the same card. A test seat only, its own open goal only —
 * a stopped goal's „found" is never due (box 51019), so it is refused, not written.
 */
export async function writeDueUpdate(
  seatId: number,
  input: { readonly goalId: number; readonly summary: string },
): Promise<FixtureOutcome> {
  const summary = input.summary.trim().slice(0, DUE_UPDATE_SUMMARY_MAX);
  if (!Number.isInteger(input.goalId) || input.goalId <= 0 || summary === '') {
    return FixtureOutcome.BadInput;
  }
  if (!(await isTestSeat(seatId))) return FixtureOutcome.NotATestSeat;
  const written = await query(
    `INSERT INTO pending_updates (user_id, task_id, kind, payload, release_at)
     SELECT $1::int, t.id, 'found', jsonb_build_object('summary', $3::text), NOW()
       FROM tasks t WHERE t.id = $2 AND t.user_id = $1::text AND t.status <> 'closed'`,
    [seatId, input.goalId, summary],
    QUERY_TIMEOUT_MS,
  );
  return (written.rowCount ?? 0) > 0 ? FixtureOutcome.Written : FixtureOutcome.BadInput;
}
