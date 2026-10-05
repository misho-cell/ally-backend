import { query } from '../db/postgres/client';

/**
 * Misho, 5 Oct („კი ააშენე"), register §92: the tester could not prove the
 * catch-all rule fix (Ninia's ask 11518) because saved rules exist only on a
 * real account, and none can be made since D562. A rule may now be written
 * onto a TEST SEAT only — never onto anybody else — so the automatic answer
 * can be exercised on fictions. The undo switches it off; nothing is deleted.
 */
const SEAT_RULE_TIMEOUT_MS = 5_000;
const MAX_KIND_CHARS = 200;
const MAX_QUESTION_CHARS = 500;
const MAX_ANSWER_CHARS = 1_000;

export enum SeatRuleRefusal {
  NotATestSeat = 'not_a_test_seat',
  Empty = 'kind, sample_question and answer are required',
  NoSuchRule = 'no rule with that id on that seat',
}

export type SeatRuleOutcome =
  | { readonly ok: true; readonly rule_id: number; readonly active: boolean }
  | { readonly ok: false; readonly refusal: SeatRuleRefusal };

async function isTestSeat(seatUserId: number): Promise<boolean> {
  const row = await query<{ user_id: number }>(
    `SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1`,
    [seatUserId],
    SEAT_RULE_TIMEOUT_MS,
  );
  return row.rows.length > 0;
}

export interface SeatRuleInput {
  readonly kind: string;
  readonly sampleQuestion: string;
  readonly answer: string;
}

/** Writes one active rule onto a test seat; refused for anyone who is not one. */
export async function addSeatAnswerRule(
  seatUserId: number,
  input: SeatRuleInput,
): Promise<SeatRuleOutcome> {
  const kind = input.kind.trim().slice(0, MAX_KIND_CHARS);
  const sample = input.sampleQuestion.trim().slice(0, MAX_QUESTION_CHARS);
  const answer = input.answer.trim().slice(0, MAX_ANSWER_CHARS);
  if (kind === '' || sample === '' || answer === '') {
    return { ok: false, refusal: SeatRuleRefusal.Empty };
  }
  if (!(await isTestSeat(seatUserId))) return { ok: false, refusal: SeatRuleRefusal.NotATestSeat };
  const inserted = await query<{ id: string }>(
    `INSERT INTO answer_rules (user_id, kind, sample_question, answer)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [seatUserId, kind, sample, answer],
    SEAT_RULE_TIMEOUT_MS,
  );
  return { ok: true, rule_id: Number(inserted.rows[0].id), active: true };
}

/** The undo: one rule of one test seat switched on or off. */
export async function setSeatAnswerRuleActive(
  seatUserId: number,
  ruleId: number,
  active: boolean,
): Promise<SeatRuleOutcome> {
  if (!(await isTestSeat(seatUserId))) return { ok: false, refusal: SeatRuleRefusal.NotATestSeat };
  const updated = await query<{ id: string }>(
    `UPDATE answer_rules SET active = $3 WHERE id = $2 AND user_id = $1 RETURNING id`,
    [seatUserId, ruleId, active],
    SEAT_RULE_TIMEOUT_MS,
  );
  if (updated.rows.length === 0) return { ok: false, refusal: SeatRuleRefusal.NoSuchRule };
  return { ok: true, rule_id: ruleId, active };
}
