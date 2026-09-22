import { query } from '../db/postgres/client';

/**
 * Ticket 19 G7: what a run actually called, readable from the admin seat.
 *
 * The admin thread read shows everything a run SAID and nothing it DID, so on
 * thread 15346 three step captions contradicted each other inside eight
 * minutes — „the second circle is empty", „the second circle shows craftsmen
 * Ketevan knows", „both circles are empty" — and nobody could say which was
 * true. The step caption is written BEFORE the tool runs; it is a statement of
 * intent, and it was being read as a record of what happened.
 *
 * This writes the record. Never the arguments and never the result: a short
 * redacted rendering of the first, and of the second only how much came back.
 */

const QUERY_TIMEOUT_MS = 5_000;

/** Enough to tell two calls of the same tool apart; short enough to read. */
const MAX_ARGS_CHARS = 300;

/** How many calls one thread read returns. A long goal thread has hundreds. */
const DEFAULT_LIMIT = 500;

/**
 * Argument values that are never written down, whatever a tool calls them.
 *
 * Not a guess at what is sensitive: these are the three field names that carry
 * a whole message to a real person. The admin can already read those in the
 * conversation; a second copy in a debugging table is one more place for them
 * to leak from.
 */
const NEVER_LOGGED_KEYS: ReadonlySet<string> = new Set([
  'answer_text',
  'question',
  'message',
  'brief',
  'note',
  'text',
]);

/** D149: a phone is written as its last four digits, never in full. */
// The leading + belongs to the number, so the match cannot start at a word
// boundary: a lookbehind is what keeps „+995…" from being logged as „+…3456".
const PHONE_LIKE = /(?<![\d+])\+?\d[\d\s()-]{6,}\d(?!\d)/g;

export interface ToolCallRow {
  readonly id: number;
  readonly run_id: string | null;
  readonly tool: string;
  readonly args_summary: string | null;
  readonly result_count: number | null;
  readonly result_empty: boolean | null;
  readonly ok: boolean | null;
  readonly result_keys: string | null;
  /** Ticket 20 row 125: what the failure said, not merely that there was one. */
  readonly error_text: string | null;
  /** Ticket 20 row 126: a short note of WHAT came back, where it is public. */
  readonly result_sample: string | null;
  readonly result_chars: number | null;
  readonly duration_ms: number | null;
  readonly created_at: string;
}

/**
 * A SEALED CONTACT REFERENCE IS A PHONE NUMBER, and I put one in this table
 * myself this morning.
 *
 * Read back from the live rows three hours after shipping the connector's
 * logging — the third of three, and the only one with an argument worth
 * looking at:
 *
 *   find_warm_path   target_ref=c_gFNfLaot3-O_GP1zSAWEBj4eezKYzEryBplmN…
 *
 * `encodeContactRef` is AES-256-GCM over „<userId>|<phone>", and its own
 * comment says what it is for: „the phone sealed inside never leaves the
 * server". It just left, into a debugging table that people read.
 *
 * TWO THINGS ARE WRONG WITH IT AND ONLY ONE NEEDS A KEY. With the key it is
 * the full number, which is the exact thing D149 forbids. WITHOUT the key it
 * is still deterministic by design — the same contact always yields the same
 * ref — so the column becomes a stable per-person identifier anybody can
 * correlate across rows and across days.
 *
 * REDACTED BY VALUE AND NOT BY KEY NAME, deliberately. `NEVER_LOGGED_KEYS`
 * would catch `contact_ref` and `target_ref` and miss whatever the next tool
 * calls its parameter — the same reason phones are matched by shape rather
 * than by the word „phone".
 */
const SEALED_CONTACT_REF = /\bc_[A-Za-z0-9_-]{24,}/g;

export function redactPhones(text: string): string {
  return text
    .replace(PHONE_LIKE, (match) => `…${match.replace(/\D/g, '').slice(-4)}`)
    .replace(SEALED_CONTACT_REF, '<contact ref>');
}

/**
 * What was passed in, as one short readable line.
 *
 * Keys are kept because „which tag did it search for" is most of the question;
 * the long free-text fields are dropped by name, and what survives is truncated
 * so one oversized argument cannot fill the table.
 */
export function summariseArgs(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (NEVER_LOGGED_KEYS.has(key)) {
      parts.push(`${key}=<${String(value ?? '').length} chars>`);
      continue;
    }
    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    parts.push(`${key}=${redactPhones(String(rendered ?? ''))}`);
  }
  const line = parts.join(' ');
  return line.length > MAX_ARGS_CHARS ? `${line.slice(0, MAX_ARGS_CHARS)}…` : line;
}

/** The tool's own count where it has one — not a guess from the shape. */
export function resultCountOf(result: unknown): number | null {
  if (result === null || typeof result !== 'object') return null;
  const count = (result as { count?: unknown }).count;
  if (typeof count === 'number') return count;
  for (const value of Object.values(result as Record<string, unknown>)) {
    if (Array.isArray(value)) return value.length;
  }
  return null;
}

/**
 * The boolean fields our tools use to say a call did not do the thing.
 *
 * `found` is deliberately NOT here. A search that found nobody worked
 * perfectly; it is empty, not failed, and conflating the two is the confusion
 * this whole table exists to end.
 */
const FAILURE_FLAGS = ['sent', 'success', 'updated', 'ok', 'saved', 'deleted'] as const;

export interface ToolOutcome {
  /** The call did what it was asked. False for a refusal or an error. */
  readonly ok: boolean;
  /** Nothing came back. Independent of ok: a search can succeed and be empty. */
  readonly empty: boolean;
  readonly count: number | null;
  /** The top-level key names of the result — schema, never content. */
  readonly keys: string | null;
  /**
   * What the failure SAID, where it said anything.
   *
   * Ticket 20 row 125. The tester asked why four of five propose_task_plan
   * calls failed on the first try, and this table — the one built to answer
   * exactly that — could only say that they had. `ok` and `result_keys`
   * record that an error existed; nothing recorded its text, and
   * args_summary's 300-character cut had already taken the rejected argument
   * with it.
   *
   * Null for a call that succeeded, so the column reads as "the reason" and
   * not as "a field that is usually empty".
   */
  readonly error: string | null;
}

/**
 * How much of an error message is kept. Our errors are one sentence written
 * for the model to act on („route must name one of the plan's routes"), so
 * this is generous for a real one and a ceiling on anything that is not.
 */
const MAX_ERROR_CHARS = 300;

/** Enough to tell five good results from five bad ones, and no more. */
const MAX_SAMPLE_CHARS = 600;

function clipSample(text: string): string {
  return text.length > MAX_SAMPLE_CHARS ? `${text.slice(0, MAX_SAMPLE_CHARS)}…` : text;
}

/**
 * The error text out of a tool result, redacted like everything else here.
 *
 * Only a STRING error is kept. Tools in this codebase answer
 * `{ ok: false, error: '…' }`; a non-string under that key is a shape we do
 * not have, and guessing at how to render it would put unreviewed content in
 * a debugging table.
 */
function errorTextOf(record: Record<string, unknown>): string | null {
  const raw = record['error'];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const text = redactPhones(raw.trim());
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}…` : text;
}

/**
 * What came back, in the three terms a reader actually asks in.
 *
 * Written after reading this table's own first 33 rows. Eight ask_contact
 * refusals were indistinguishable from eight sends, and three empty
 * second-degree searches were recorded as „not empty" because
 * search_second_degree answers {found:false, reason:'no_matches'} and carries
 * no count key at all. Both are the same mistake: reading one field and
 * assuming the rest of the world uses it.
 */
export function outcomeOf(result: unknown): ToolOutcome {
  const count = resultCountOf(result);
  if (result === null || typeof result !== 'object') {
    const text = typeof result === 'string' ? result : '';
    return { ok: true, empty: text.trim() === '', count, keys: null, error: null };
  }
  const record = result as Record<string, unknown>;
  const failed = 'error' in record || FAILURE_FLAGS.some((flag) => record[flag] === false);
  const firstList = Object.values(record).find((value) => Array.isArray(value));
  const empty =
    count === 0 ||
    record['found'] === false ||
    (Array.isArray(firstList) && firstList.length === 0) ||
    Object.keys(record).length === 0;
  return {
    ok: !failed,
    empty,
    count,
    keys: Object.keys(record).sort().join(',') || null,
    error: errorTextOf(record),
  };
}

/**
 * Where the call came from.
 *
 * The connector's calls were never written down at all — `thread_id` was NOT
 * NULL and a connector call has no thread — so for three days I read this
 * table's counts as „every call" when they were „every CHAT call". The value
 * is stored rather than derived from a null thread, because a meaning that has
 * to be remembered is one that gets forgotten, and because the numbers either
 * side of migration 166 are only comparable through this column.
 */
export type ToolCallSurface = 'chat' | 'connector';

export interface ToolCallRecord {
  /** Null for a connector call: there is no conversation it belongs to. */
  readonly threadId: number | null;
  readonly surface: ToolCallSurface;
  readonly runId: string | null;
  readonly userId: string;
  readonly tool: string;
  readonly input: Record<string, unknown>;
  readonly result: unknown;
  readonly durationMs: number;
  /**
   * Ticket 20 row 126, third pass — a short, readable note of what came back.
   *
   * The seat is judging whether the model was right to ignore the opening web
   * results, and the table could say the search ran, returned 5 and took 4,004
   * ms — and nothing about whether those five were car workshops or junk.
   * „Ignored good results" and „ignored junk" looked identical, and only one
   * of them is a fault.
   *
   * Passed ONLY by callers whose results are public web material. Never
   * derived from the result automatically: a search over somebody's contacts
   * must not leave a sample of them in a debugging table.
   */
  readonly resultSample?: string;
}

/**
 * One call, written down.
 *
 * Never throws and never blocks the run on its own failure: a debugging record
 * that can break a user's answer is worse than no debugging record. The caller
 * awaits nothing.
 */
export async function logToolCall(record: ToolCallRecord): Promise<void> {
  try {
    const serialised = JSON.stringify(record.result ?? null);
    const outcome = outcomeOf(record.result);
    await query(
      `INSERT INTO tool_call_log
         (thread_id, surface, run_id, user_id, tool, args_summary,
          result_count, result_empty, result_chars, duration_ms, ok, result_keys, error_text,
          result_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        record.threadId,
        record.surface,
        record.runId,
        record.userId,
        record.tool,
        summariseArgs(record.input),
        outcome.count,
        outcome.empty,
        serialised.length,
        record.durationMs,
        outcome.ok,
        outcome.keys,
        outcome.error,
        record.resultSample === undefined ? null : clipSample(redactPhones(record.resultSample)),
      ],
      QUERY_TIMEOUT_MS,
    );
  } catch (error) {
    // Logged, never swallowed: logSearchActivity once failed silently on every
    // search for hours and nothing anywhere showed it.
    // eslint-disable-next-line no-console
    console.error(`[tool-call-log] could not record ${record.tool}:`, error);
  }
}

/** Every call this thread made, oldest first — the order they happened in. */
export async function getToolCallsForThread(
  threadId: number,
  limit = DEFAULT_LIMIT,
): Promise<ToolCallRow[]> {
  const result = await query<ToolCallRow>(
    `SELECT id, run_id, tool, args_summary, ok, result_count, result_empty,
            result_keys, result_chars, duration_ms, error_text, result_sample, created_at
       FROM tool_call_log
      WHERE thread_id = $1
      ORDER BY id
      LIMIT $2`,
    [threadId, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
