import { query } from '../db/postgres/client';
import { ASK_EXPIRES_AFTER_DAYS } from './askState';
import { wakeTaskNoLaterThan } from './taskStore.service';
import { ASKED_AS_THE_ASKER_SAVED_THEM } from './savedNameSql';

/**
 * #1684 (A1): two weeks of silence end an ask, as for introduction requests
 * (D496), and the owner is told once. Before this an unanswered ask stayed
 * „sent" forever, and a goal waited on people who had long stopped reading.
 *
 * A „later" that still holds is not silence: it is excluded until it runs out.
 */
const QUERY_TIMEOUT_MS = 8_000;
const MAX_EXPIRED_PER_SWEEP = 200;
const MAX_TOLD_PER_WAKE = 20;

/** Stamps the asks that have run out and wakes their goals; returns how many expired. */
export async function expireSilentAsks(): Promise<number> {
  const result = await query<{ task_id: number }>(
    `UPDATE task_asks SET expired_at = NOW()
      WHERE id IN (
        SELECT id FROM task_asks
         WHERE status = 'sent' AND expired_at IS NULL
           AND created_at < NOW() - make_interval(days => $1)
           AND (later_until IS NULL OR later_until <= NOW())
         ORDER BY created_at
         LIMIT $2)
      RETURNING task_id`,
    [ASK_EXPIRES_AFTER_DAYS, MAX_EXPIRED_PER_SWEEP],
    QUERY_TIMEOUT_MS,
  );
  const now = new Date();
  const goals = [...new Set(result.rows.map((r) => r.task_id))];
  await Promise.all(goals.map((taskId) => wakeTaskNoLaterThan(taskId, now)));
  return result.rows.length;
}

/** The names whose asks expired and the owner was not yet told; claimed, so told once. */
export async function claimExpiredAsksToTell(taskId: number): Promise<string[]> {
  const result = await query<{ name: string | null }>(
    `UPDATE task_asks ta SET expiry_told_at = NOW()
      WHERE ta.id IN (
        SELECT id FROM task_asks
         WHERE task_id = $1 AND expired_at IS NOT NULL AND expiry_told_at IS NULL
         ORDER BY expired_at
         LIMIT $2)
      RETURNING ${ASKED_AS_THE_ASKER_SAVED_THEM} AS name`,
    [taskId, MAX_TOLD_PER_WAKE],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.name ?? 'კონტაქტი');
}

/** What the wake run is told; null when nothing expired. */
export function expiredAsksNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return (
    `ამ ადამიანებმა ${ASK_EXPIRES_AFTER_DAYS} დღე არ უპასუხეს და მათი კითხვა დაიხურა: ` +
    `${[...new Set(names)].join(', ')}. მფლობელს ერთი ხაზით ერთხელ უთხარი — ` +
    'ხელახლა მათ არ მისწერო ცალკე თანხმობის გარეშე.'
  );
}
