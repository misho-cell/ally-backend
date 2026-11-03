import { gunzipSync } from 'zlib';
import { query } from '../db/postgres/client';
import { redactPhones } from './toolCallLog.service';

/**
 * Misho, 3 Nov: the parts of a run trace that runTraceRecorder.service.ts
 * writes — the server's own steps (model calls, dropped and rewritten
 * replies) and the exact prompt texts a test seat's run was sent.
 */
const EXTRAS_TIMEOUT_MS = 8_000;
const MAX_EVENTS_READ = 3_000;
const MAX_PROMPTS_READ = 50;

export interface TraceServerStep {
  readonly at: string;
  readonly kind: string;
  readonly detail: unknown;
}

/** The server's own steps for these runs, oldest first, grouped by run. */
export async function serverStepsByRun(
  runIds: readonly string[],
): Promise<Map<string, TraceServerStep[]>> {
  const result = await query<{ run_id: string; kind: string; detail: unknown; created_at: Date }>(
    `SELECT run_id, kind, detail, created_at FROM run_trace_events
      WHERE run_id = ANY($1::text[])
      ORDER BY created_at
      LIMIT $2`,
    [[...runIds], MAX_EVENTS_READ],
    EXTRAS_TIMEOUT_MS,
  );
  const byRun = new Map<string, TraceServerStep[]>();
  for (const row of result.rows) {
    const step = { at: row.created_at.toISOString(), kind: row.kind, detail: row.detail };
    byRun.set(row.run_id, [...(byRun.get(row.run_id) ?? []), step]);
  }
  return byRun;
}

/** The exact prompt texts behind these hashes, phones redacted. */
export async function promptTexts(hashes: readonly string[]): Promise<Map<string, string>> {
  if (hashes.length === 0) return new Map();
  const result = await query<{ hash: string; text_gzip: Buffer }>(
    `SELECT hash, text_gzip FROM run_prompt_texts WHERE hash = ANY($1::text[]) LIMIT $2`,
    [[...hashes], MAX_PROMPTS_READ],
    EXTRAS_TIMEOUT_MS,
  );
  return new Map(
    result.rows.map((row) => [row.hash, redactPhones(gunzipSync(row.text_gzip).toString('utf8'))]),
  );
}
