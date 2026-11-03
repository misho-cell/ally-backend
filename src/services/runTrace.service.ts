import { query } from '../db/postgres/client';
import { redactPhones } from './toolCallLog.service';
import { promptTexts, serverStepsByRun, TraceServerStep } from './runTraceExtras.service';

/**
 * Misho, 3 Nov („სრული პროცესის დანახვა მინდა … რიქვესთიდან რისპონსამდე"):
 * prompt debugging needs the whole road of one answer — the owner's line, the
 * prompt blocks and versions that ran, every model step (its reasoning
 * summary where one was asked for, its text, each tool it called with the
 * arguments and the full result), the server's own events, the timings and
 * errors, and what the run cost. Everything is read from what the server
 * already stores, so old conversations can be traced too; the reasoning
 * summary exists only for runs on test seats after it was switched on.
 * Phones are redacted in everything returned (D149).
 */
const TRACE_TIMEOUT_MS = 8_000;
export const DEFAULT_TRACE_RUNS = 5;
export const MAX_TRACE_RUNS = 20;
const MAX_TRACE_ROWS = 3_000;
const MAX_TOOL_RESULT_CHARS = 6_000;
/** The owner's line arrives a moment before the run that answers it starts. */
const OWNER_LINE_LEAD_MS = 120_000;

export enum TraceStepType {
  OwnerLine = 'owner_line',
  ServerEvent = 'server_event',
  Caption = 'caption',
  Reasoning = 'reasoning',
  Text = 'text',
  ToolCall = 'tool_call',
  ToolResult = 'tool_result',
}

export interface TraceStep {
  readonly at: string;
  readonly type: TraceStepType;
  readonly text?: string;
  readonly tool?: string;
  readonly input?: string;
  readonly is_error?: boolean;
}

export interface TraceToolCall {
  readonly tool: string;
  readonly ok: boolean;
  readonly duration_ms: number | null;
  readonly error: string | null;
  readonly at: string;
}

export interface TraceCost {
  readonly kind: string;
  readonly model: string | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_usd: number;
}

export interface TraceOptions {
  /** Tool results whole, not clipped at MAX_TOOL_RESULT_CHARS. */
  readonly fullResults: boolean;
  /** The exact prompt texts the run was sent (test seats; large). */
  readonly withPrompt: boolean;
}

export const DEFAULT_TRACE_OPTIONS: TraceOptions = { fullResults: false, withPrompt: false };

export interface RunTrace {
  readonly run_id: string;
  readonly started_at: string;
  readonly mode: string;
  readonly prompt_blocks: readonly string[];
  readonly prompt_versions: unknown;
  readonly steps: readonly TraceStep[];
  readonly tool_calls: readonly TraceToolCall[];
  readonly costs: readonly TraceCost[];
  readonly server_steps: readonly TraceServerStep[];
  readonly prompt_hashes: readonly string[];
  readonly prompt_texts?: readonly string[];
}

interface StampRow {
  run_id: string;
  mode: string;
  block_names: string[] | null;
  block_versions: unknown;
  prompt_hashes: string[] | null;
  started_at: Date;
}

interface ConversationRow {
  role: string;
  kind: string | null;
  content: string | null;
  content_json: unknown;
  created_at: Date;
}

async function runStamps(
  threadId: number,
  runs: number,
  runId: string | null,
): Promise<StampRow[]> {
  const result = await query<StampRow>(
    `SELECT run_id, mode, block_names, block_versions, prompt_hashes, created_at AS started_at
       FROM run_prompt_stamps
      WHERE thread_id = $1 AND ($3::text IS NULL OR run_id = $3)
      ORDER BY created_at DESC
      LIMIT $2`,
    [threadId, runs, runId],
    TRACE_TIMEOUT_MS,
  );
  return result.rows.reverse();
}

async function conversationRows(threadId: number, from: Date): Promise<ConversationRow[]> {
  const result = await query<ConversationRow>(
    `SELECT role, kind, content, content_json, created_at
       FROM conversations
      WHERE thread_id = $1 AND created_at >= $2
      ORDER BY created_at
      LIMIT $3`,
    [threadId, new Date(from.getTime() - OWNER_LINE_LEAD_MS), MAX_TRACE_ROWS],
    TRACE_TIMEOUT_MS,
  );
  return result.rows;
}

async function toolCalls(runIds: readonly string[]): Promise<Map<string, TraceToolCall[]>> {
  const result = await query<{
    run_id: string;
    tool: string;
    ok: boolean | null;
    duration_ms: number | null;
    error_text: string | null;
    created_at: Date;
  }>(
    `SELECT run_id, tool, ok, duration_ms, error_text, created_at
       FROM tool_call_log WHERE run_id = ANY($1::text[])
      ORDER BY created_at
      LIMIT $2`,
    [[...runIds], MAX_TRACE_ROWS],
    TRACE_TIMEOUT_MS,
  );
  const byRun = new Map<string, TraceToolCall[]>();
  for (const row of result.rows) {
    const call: TraceToolCall = {
      tool: row.tool,
      ok: row.ok !== false,
      duration_ms: row.duration_ms,
      error: row.error_text === null ? null : redactPhones(row.error_text),
      at: row.created_at.toISOString(),
    };
    byRun.set(row.run_id, [...(byRun.get(row.run_id) ?? []), call]);
  }
  return byRun;
}

async function runCosts(runIds: readonly string[]): Promise<Map<string, TraceCost[]>> {
  const result = await query<{
    run_id: string;
    kind: string;
    model: string | null;
    input_tokens: string;
    output_tokens: string;
    cost_usd: string;
  }>(
    `SELECT run_id, kind, model,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM usage_events WHERE run_id = ANY($1::text[])
      GROUP BY run_id, kind, model
      LIMIT $2`,
    [[...runIds], MAX_TRACE_ROWS],
    TRACE_TIMEOUT_MS,
  );
  const byRun = new Map<string, TraceCost[]>();
  for (const row of result.rows) {
    const cost: TraceCost = {
      kind: row.kind,
      model: row.model,
      input_tokens: Number(row.input_tokens),
      output_tokens: Number(row.output_tokens),
      cost_usd: Number(row.cost_usd),
    };
    byRun.set(row.run_id, [...(byRun.get(row.run_id) ?? []), cost]);
  }
  return byRun;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clipped(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)} … [${text.length - max} more chars]`;
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('\n');
  }
  return JSON.stringify(content ?? '');
}

/** One stored content block as a trace step; null for a block with nothing to show. */
export function blockStep(
  block: unknown,
  at: string,
  maxResultChars: number = MAX_TOOL_RESULT_CHARS,
): TraceStep | null {
  if (!isRecord(block)) return null;
  switch (block.type) {
    case 'thinking': {
      const text = typeof block.thinking === 'string' ? block.thinking : '';
      return text === '' ? null : { at, type: TraceStepType.Reasoning, text: redactPhones(text) };
    }
    case 'text':
      return typeof block.text === 'string' && block.text.trim() !== ''
        ? { at, type: TraceStepType.Text, text: redactPhones(block.text) }
        : null;
    case 'tool_use':
      return {
        at,
        type: TraceStepType.ToolCall,
        tool: typeof block.name === 'string' ? block.name : '',
        input: redactPhones(JSON.stringify(block.input ?? {})),
      };
    case 'tool_result':
      return {
        at,
        type: TraceStepType.ToolResult,
        text: redactPhones(clipped(resultText(block.content), maxResultChars)),
        is_error: block.is_error === true,
      };
    default:
      return null;
  }
}

function plainStepType(row: ConversationRow): TraceStepType {
  if (row.kind === 'event') return TraceStepType.ServerEvent;
  if (row.kind === 'caption') return TraceStepType.Caption;
  return row.role === 'user' ? TraceStepType.OwnerLine : TraceStepType.Text;
}

/** A stored conversation row as trace steps, in the order they happened. */
export function rowSteps(
  row: ConversationRow,
  maxResultChars: number = MAX_TOOL_RESULT_CHARS,
): TraceStep[] {
  const at = row.created_at.toISOString();
  if (Array.isArray(row.content_json)) {
    return row.content_json
      .map((block) => blockStep(block, at, maxResultChars))
      .filter((step): step is TraceStep => step !== null);
  }
  const text = row.content ?? '';
  if (text.trim() === '') return [];
  return [{ at, type: plainStepType(row), text: redactPhones(text) }];
}

/**
 * Which run a row belongs to: the latest run started at or before it; an
 * owner's line belongs to the run that starts right after it.
 */
export function runIndexOf(row: ConversationRow, starts: readonly number[]): number {
  const time = row.created_at.getTime();
  const isOwnerLine = row.role === 'user' && row.kind !== 'event' && row.kind !== 'caption';
  if (isOwnerLine) {
    const next = starts.findIndex((start) => start >= time && start - time <= OWNER_LINE_LEAD_MS);
    if (next >= 0) return next;
  }
  let latest = -1;
  starts.forEach((start, i) => {
    if (start <= time) latest = i;
  });
  return latest;
}

function stepsByRun(
  rows: readonly ConversationRow[],
  stamps: readonly StampRow[],
  maxResultChars: number,
): TraceStep[][] {
  const starts = stamps.map((stamp) => stamp.started_at.getTime());
  const steps: TraceStep[][] = stamps.map(() => []);
  for (const row of rows) {
    const index = runIndexOf(row, starts);
    if (index >= 0) steps[index].push(...rowSteps(row, maxResultChars));
  }
  return steps;
}

/** Is this conversation a test seat's? Test seats are traced without the reader gate. */
export async function isTestSeatThread(threadId: number): Promise<boolean> {
  const result = await query<{ one: number }>(
    `SELECT 1 AS one FROM conversations c
       JOIN test_seats s ON s.user_id = c.user_id
      WHERE c.thread_id = $1
      LIMIT 1`,
    [threadId],
    TRACE_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/** The last runs of one conversation, oldest first, each from request to reply. */
export async function traceThread(
  threadId: number,
  runs: number,
  runId: string | null,
  options: TraceOptions = DEFAULT_TRACE_OPTIONS,
): Promise<RunTrace[]> {
  const stamps = await runStamps(threadId, runs, runId);
  if (stamps.length === 0) return [];
  const runIds = stamps.map((stamp) => stamp.run_id);
  const hashes = options.withPrompt ? stamps.flatMap((stamp) => stamp.prompt_hashes ?? []) : [];
  const [rows, calls, costs, serverSteps, texts] = await Promise.all([
    conversationRows(threadId, stamps[0].started_at),
    toolCalls(runIds),
    runCosts(runIds),
    serverStepsByRun(runIds),
    promptTexts(hashes),
  ]);
  const steps = stepsByRun(rows, stamps, options.fullResults ? Infinity : MAX_TOOL_RESULT_CHARS);
  return stamps.map((stamp, i) => ({
    run_id: stamp.run_id,
    started_at: stamp.started_at.toISOString(),
    mode: stamp.mode,
    prompt_blocks: stamp.block_names ?? [],
    prompt_versions: stamp.block_versions,
    steps: steps[i],
    tool_calls: calls.get(stamp.run_id) ?? [],
    costs: costs.get(stamp.run_id) ?? [],
    server_steps: serverSteps.get(stamp.run_id) ?? [],
    prompt_hashes: stamp.prompt_hashes ?? [],
    ...(options.withPrompt
      ? { prompt_texts: (stamp.prompt_hashes ?? []).map((hash) => texts.get(hash) ?? '') }
      : {}),
  }));
}
