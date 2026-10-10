import { query } from '../db/postgres/client';
import { askField } from './answerStats.service';
import { getTaskById } from './taskStore.service';
import { ownerGoalWords, RankedCandidate, rankingOf } from './waveOrder';

/**
 * The tester's 49931 (1691): the server's own ranking of a goal's plan, read
 * by the admin, so the order can be judged without a sixth person. Only a
 * goal on a fictional seat is read; a real owner's plan is not listed here.
 */
const QUERY_TIMEOUT_MS = 5_000;

export enum WaveRankingOutcome {
  Read = 'read',
  NotFound = 'not_found',
  NotATestSeat = 'not_a_test_seat',
  NoPlan = 'no_plan',
}

export interface WaveRankingResult {
  readonly outcome: WaveRankingOutcome;
  /** The answer-stats field the rates are read in. */
  readonly field?: string;
  /** Which plan was ranked: one waiting on the owner, or the one in force. */
  readonly plan_state?: 'proposed' | 'approved_or_in_force';
  readonly ranking?: readonly RankedCandidate[];
}

async function ownerIsTestSeat(userId: string): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM test_seats WHERE user_id = $1::int) AS found`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

export async function goalWaveRanking(taskId: number): Promise<WaveRankingResult> {
  const task = await getTaskById(taskId);
  if (task === null) return { outcome: WaveRankingOutcome.NotFound };
  if (!(await ownerIsTestSeat(task.user_id))) return { outcome: WaveRankingOutcome.NotATestSeat };
  // The tester's 49996: a proposed plan is read too, so the ranking can be
  // judged before anything is sent. A proposal waiting on the owner is the
  // newer plan when both exist.
  const plan = task.plan_proposed ?? task.plan;
  if (plan === null || plan.people_to_involve.length === 0) {
    return { outcome: WaveRankingOutcome.NoPlan };
  }
  const goalText = task.title;
  return {
    outcome: WaveRankingOutcome.Read,
    field: askField(goalText),
    plan_state: task.plan_proposed === null ? 'approved_or_in_force' : 'proposed',
    ranking: await rankingOf(plan.people_to_involve, goalText, await ownerGoalWords(taskId)),
  };
}
