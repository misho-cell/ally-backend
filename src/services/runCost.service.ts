import { query } from '../db/postgres/client';

/**
 * ROW 291 (widened) — WHAT EACH RUN OF A THREAD COST.
 *
 * The seat could see what a run did (tool_call_log) and what it said, but not
 * what it cost, so a reply that burned a wallet could not be told from one
 * that did not. usage_events already carries run_id on every model call and
 * every web search; this adds them up per run.
 *
 * The run ids come from the thread's own messages and tool calls: both tables
 * are indexed by thread, usage_events is indexed by run, and a web search's
 * usage row carries no thread id at all — so joining through the run is the
 * only way its cost lands on the right run.
 */

const RUN_COST_TIMEOUT_MS = 5_000;
const RUN_COST_LIMIT = 200;

export interface RunCost {
  readonly run_id: string;
  readonly started_at: string;
  readonly cost_usd: number;
  readonly model_calls: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_write_tokens: number;
  readonly cache_read_tokens: number;
}

interface RunCostRow {
  run_id: string;
  started_at: string;
  cost_usd: string | null;
  model_calls: string;
  input_tokens: string | null;
  output_tokens: string | null;
  cache_write_tokens: string | null;
  cache_read_tokens: string | null;
}

const asNumber = (value: string | null): number => Number(value ?? 0);

/** Every run of this thread with its cost, oldest first. */
export async function getRunCostsForThread(threadId: number): Promise<RunCost[]> {
  const result = await query<RunCostRow>(
    `WITH runs AS (
       SELECT run_id FROM conversations WHERE thread_id = $1 AND run_id IS NOT NULL
       UNION
       SELECT run_id FROM tool_call_log WHERE thread_id = $1 AND run_id IS NOT NULL
     )
     SELECT u.run_id,
            MIN(u.created_at)                          AS started_at,
            SUM(u.cost_usd)                            AS cost_usd,
            COUNT(*) FILTER (WHERE u.kind = 'chat')    AS model_calls,
            SUM(u.input_tokens)                        AS input_tokens,
            SUM(u.output_tokens)                       AS output_tokens,
            SUM(u.cache_creation_tokens)               AS cache_write_tokens,
            SUM(u.cache_read_tokens)                   AS cache_read_tokens
       FROM usage_events u
       JOIN runs r ON r.run_id = u.run_id
      GROUP BY u.run_id
      ORDER BY MIN(u.created_at)
      LIMIT $2`,
    [threadId, RUN_COST_LIMIT],
    RUN_COST_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    run_id: row.run_id,
    started_at: row.started_at,
    cost_usd: asNumber(row.cost_usd),
    model_calls: asNumber(row.model_calls),
    input_tokens: asNumber(row.input_tokens),
    output_tokens: asNumber(row.output_tokens),
    cache_write_tokens: asNumber(row.cache_write_tokens),
    cache_read_tokens: asNumber(row.cache_read_tokens),
  }));
}
