import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { query } from '../db/postgres/client';
import { redactPhones } from './toolCallLog.service';

/**
 * Misho, 3 Nov („სრული სურათი მინდა დავინახო რომ კარგად დავადებაგო"): what a
 * run decided and why, kept where the run trace (runTrace.service.ts) can read
 * it — the exact prompt each model round was sent, and the
 * server's own steps that leave no other row: each model call, a reply the
 * server dropped and why, a reply it rewrote. Every write is best-effort and
 * never holds up or fails the run; a failure is logged and the run goes on.
 */
const TRACE_WRITE_TIMEOUT_MS = 3_000;
const TRACE_RETENTION_DAYS = 30;
/** Prompt texts are the bulk (~10 KB compressed per round, ~8,400 rounds a day): kept 14 days. */
const PROMPT_RETENTION_DAYS = 14;
/** A reply kept in a trace event is clipped; the conversation holds the rest. */
const MAX_EVENT_TEXT_CHARS = 4_000;

export enum TraceEventKind {
  ModelCall = 'model_call',
  ReplyDropped = 'reply_dropped',
  ReplyRewritten = 'reply_rewritten',
}

export interface ModelCallDetail {
  readonly model: string;
  readonly stop_reason: string | null;
  readonly duration_ms: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
}

/** Hashes already stored by this process, so a repeated prompt is not resent. */
const storedHashes = new Set<string>();
const MAX_REMEMBERED_HASHES = 20_000;

function clip(text: string): string {
  const safe = redactPhones(text);
  return safe.length <= MAX_EVENT_TEXT_CHARS ? safe : `${safe.slice(0, MAX_EVENT_TEXT_CHARS)} …`;
}

function logFailure(what: string, runId: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[run-trace] ${what} for run ${runId} not kept:`, (err as Error).message);
}

export function promptHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function storePromptText(hash: string, text: string): Promise<void> {
  if (storedHashes.has(hash)) return;
  await query(
    `INSERT INTO run_prompt_texts (hash, text_gzip, chars) VALUES ($1, $2, $3)
     ON CONFLICT (hash) DO NOTHING`,
    [hash, gzipSync(Buffer.from(text, 'utf8')), text.length],
    TRACE_WRITE_TIMEOUT_MS,
  );
  if (storedHashes.size >= MAX_REMEMBERED_HASHES) storedHashes.clear();
  storedHashes.add(hash);
}

/** Keeps the exact system prompt a model round was sent. */
export async function recordPromptSent(runId: string, systemPrompt: string): Promise<void> {
  try {
    const hash = promptHash(systemPrompt);
    await storePromptText(hash, systemPrompt);
    await query(
      `UPDATE run_prompt_stamps
          SET prompt_hashes = CASE WHEN prompt_hashes[array_length(prompt_hashes, 1)] = $2
                                   THEN prompt_hashes ELSE prompt_hashes || $2 END
        WHERE run_id = $1`,
      [runId, hash],
      TRACE_WRITE_TIMEOUT_MS,
    );
  } catch (err) {
    logFailure('prompt text', runId, err);
  }
}

async function recordEvent(runId: string, kind: TraceEventKind, detail: object): Promise<void> {
  try {
    await query(
      'INSERT INTO run_trace_events (run_id, kind, detail) VALUES ($1, $2, $3::jsonb)',
      [runId, kind, JSON.stringify(detail)],
      TRACE_WRITE_TIMEOUT_MS,
    );
    pruneNowAndThen();
  } catch (err) {
    logFailure(kind, runId, err);
  }
}

/** One model round: which model answered, why it stopped, how long, how many tokens. */
export function recordModelCall(runId: string, detail: ModelCallDetail): Promise<void> {
  return recordEvent(runId, TraceEventKind.ModelCall, detail);
}

/** A reply the server did not show, and the rule that held it back. */
export function recordReplyDropped(runId: string, reason: string, reply: string): Promise<void> {
  return recordEvent(runId, TraceEventKind.ReplyDropped, { reason, reply: clip(reply) });
}

/** A reply the server rewrote: who rewrote it, what it said before and after. */
export function recordReplyRewritten(
  runId: string,
  by: string,
  before: string,
  after: string,
): Promise<void> {
  if (before.trim() === after.trim()) return Promise.resolve();
  return recordEvent(runId, TraceEventKind.ReplyRewritten, {
    by,
    before: clip(before),
    after: clip(after),
  });
}

/** The prune runs at most this often per process, on the back of an ordinary write. */
const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

function pruneNowAndThen(): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_EVERY_MS) return;
  lastPruneAt = now;
  void pruneRunTrace();
}

/** Drops trace rows and unreferenced prompt texts past the retention window. */
export async function pruneRunTrace(): Promise<void> {
  // A pruned text is written again the next time a round sends it.
  storedHashes.clear();
  try {
    await query(
      `DELETE FROM run_trace_events WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [TRACE_RETENTION_DAYS],
      TRACE_WRITE_TIMEOUT_MS,
    );
    await query(
      `DELETE FROM run_prompt_texts WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [PROMPT_RETENTION_DAYS],
      TRACE_WRITE_TIMEOUT_MS,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[run-trace] prune failed:', (err as Error).message);
  }
}
