import { query } from '../db/postgres/client';
import { askField } from './answerStats.service';
import { FACT_FIELD_TYPES } from './contactFacts.service';
import { normalizePhone } from './phone';

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
  readonly goalText: string;
  readonly asked: number;
  readonly yes: number;
  readonly no: number;
  readonly referred: number;
  readonly firstAnswerMinutesMedian: number | null;
}

function isCount(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_STAT;
}

/**
 * 1691: the seat's answer record in the field the goal text files under, set
 * exactly. The hourly recount rebuilds it from real asks once the seat is
 * asked, so it holds for the first wave, which is what 1691 orders.
 */
export async function writeAnswerRecord(
  seatId: number,
  input: AnswerRecordInput,
): Promise<FixtureOutcome> {
  const field = askField(input.goalText);
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
