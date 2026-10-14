import { query } from '../db/postgres/client';
import { isPlaceholderThreadTitle } from './runLanguage';
import { writeShortTitles } from './threadTitle.service';

/**
 * 4919, Misho's yes of 14 October („ჩემგან ყველა დავალებაზე კია და გააკეთე
 * ყველა"): the short titles were made for new conversations only, so every
 * older one showed a cut-off chip. This fills them, a bounded batch per call,
 * newest first, for real people's conversations only — a fictional seat's are
 * the tester's and new ones get theirs anyway.
 *
 * A cursor (`beforeId`) walks the table once: a title the model cannot shorten
 * is left for the client to cut, never asked again by the next batch.
 */
// One call holds an HTTP request open while its titles are made one by one:
// 25 at about a second each stays well inside a proxy timeout.
export const BACKFILL_MAX_BATCH = 25;
const BACKFILL_QUERY_TIMEOUT_MS = 8_000;

export interface BackfillBatch {
  readonly asked: number;
  readonly filled: number;
  /** Pass back as `before_id` for the next batch; null when nothing older is left. */
  readonly next_before_id: number | null;
}

interface UntitledRow {
  readonly id: number;
  readonly user_id: number;
  readonly title: string;
}

async function threadsWithoutShortTitles(
  limit: number,
  beforeId: number | null,
): Promise<UntitledRow[]> {
  const result = await query<UntitledRow>(
    `SELECT t.id, t.user_id, t.title
       FROM threads t
      WHERE t.short_title IS NULL
        AND t.title IS NOT NULL
        AND ($2::int IS NULL OR t.id < $2::int)
        AND NOT EXISTS (SELECT 1 FROM test_seats s WHERE s.user_id = t.user_id)
      ORDER BY t.id DESC
      LIMIT $1`,
    [limit, beforeId],
    BACKFILL_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** One batch: each title shortened in turn, so a batch never bursts the model. */
export async function backfillShortTitles(
  limit: number,
  beforeId: number | null,
): Promise<BackfillBatch> {
  const rows = await threadsWithoutShortTitles(limit, beforeId);
  let filled = 0;
  for (const row of rows) {
    if (isPlaceholderThreadTitle(row.title)) continue;
    if (await writeShortTitles(String(row.user_id), row.id, row.title, row.title)) filled += 1;
  }
  const last = rows[rows.length - 1];
  return {
    asked: rows.length,
    filled,
    next_before_id: rows.length < limit || last === undefined ? null : last.id,
  };
}
