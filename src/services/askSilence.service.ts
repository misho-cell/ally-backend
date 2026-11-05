import { query } from '../db/postgres/client';
import { wakeTaskNoLaterThan } from './taskStore.service';
import { ASKED_AS_THE_ASKER_SAVED_THEM } from './savedNameSql';

/**
 * Board #7760: an ask to somebody who cannot or will not help sat as „sent",
 * and the asker heard nothing until the two-week expiry (#1684). Now, after
 * SILENT_ASK_DAYS without an answer, the asker's goal is woken with one
 * factual line — who has not answered, and for how long — and the run tells
 * the owner and says the next step. Structural only: days since the ask row
 * was written, never the words of anything.
 *
 * A plan with steps is left out: its own on_silence rule already moves it on
 * (autonomy stage 2, K3). A „later" that still holds is not silence. A relayed
 * ask (parent_ask_id) belongs to the helper's chain, not the owner's goal.
 */
export const SILENT_ASK_DAYS = 3;

const QUERY_TIMEOUT_MS = 8_000;
const MAX_GOALS_PER_SWEEP = 50;
const MAX_TOLD_PER_WAKE = 20;

/** The asks of an open goal without steps that are SILENT_ASK_DAYS quiet and not yet told. */
const SILENT_AND_UNTOLD = `
  a.status = 'sent' AND a.expired_at IS NULL AND a.silence_told_at IS NULL
  AND a.parent_ask_id IS NULL
  AND a.created_at < NOW() - make_interval(days => $1)
  AND (a.later_until IS NULL OR a.later_until <= NOW())
  AND t.status = 'open'
  AND COALESCE(jsonb_typeof(t.plan->'steps'), '') <> 'array'`;

/** Wakes (no later than now) every goal that has such an ask; returns how many. */
export async function wakeGoalsWithSilentAsks(now: Date = new Date()): Promise<number> {
  const result = await query<{ task_id: number }>(
    `SELECT DISTINCT a.task_id
       FROM task_asks a JOIN tasks t ON t.id = a.task_id
      WHERE ${SILENT_AND_UNTOLD}
      LIMIT $2`,
    [SILENT_ASK_DAYS, MAX_GOALS_PER_SWEEP],
    QUERY_TIMEOUT_MS,
  );
  const woken = await Promise.all(result.rows.map((row) => wakeTaskNoLaterThan(row.task_id, now)));
  return woken.filter(Boolean).length;
}

/** The names of this goal's silent asks, claimed, so the owner is told once. */
export async function claimSilentAsksToTell(taskId: number): Promise<string[]> {
  const result = await query<{ name: string | null }>(
    `UPDATE task_asks ta SET silence_told_at = NOW()
      WHERE ta.id IN (
        SELECT a.id FROM task_asks a JOIN tasks t ON t.id = a.task_id
         WHERE a.task_id = $2 AND ${SILENT_AND_UNTOLD}
         ORDER BY a.created_at
         LIMIT $3)
      RETURNING ${ASKED_AS_THE_ASKER_SAVED_THEM} AS name`,
    [SILENT_ASK_DAYS, taskId, MAX_TOLD_PER_WAKE],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.name ?? 'კონტაქტი');
}

/** The wake's line; null when nobody is silent. Model-facing, like the expiry note. */
export function silentAsksNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return (
    `ამ ადამიანებს ${SILENT_ASK_DAYS} დღეა კითხვაზე არ უპასუხიათ: ` +
    `${[...new Set(names)].join(', ')}. მფლობელს ერთი ხაზით უთხარი, ვინ არ უპასუხა, და რა ` +
    'არის შემდეგი ნაბიჯი — გეგმის შემდეგი ადამიანი, სხვა გზა, ან ლოდინი. იმავე ადამიანს ' +
    'ხელახლა ნუ მისწერ ცალკე თანხმობის გარეშე.'
  );
}
