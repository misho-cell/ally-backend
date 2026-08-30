// Prompt blocks v2: the prompt team creates, edits, reorders, trials, and
// retires blocks entirely from the admin console. A block carries its own
// mode bindings; composition reads the catalog per run, so a change is live
// on the very next message. Guardrails live HERE (not in the routes): name
// and mode validation, the per-mode character ceiling, history snapshots.

import { query, withTransaction } from '../db/postgres/client';
import { intEnv } from '../config/runBudgets';

const BLOCK_QUERY_TIMEOUT_MS = 5_000;
// Block names are API-addressable identifiers, not free text.
const BLOCK_NAME_RE = /^[a-z0-9_]{2,40}$/;
// Exported: the admin route's validator reads THIS number — it sat at a
// stale 20,000 after the 20k → 30k raise below, so a 20,286-char PUT bounced
// with an undocumented cap while the page's counter said "of 30,000"
// (ticket 8 task 10 / Q-38). One constant, one truth.
export const MAX_BLOCK_CONTENT_CHARS = 30_000;
// Ceiling for the SUM of enabled block content bound to one mode (on top of
// the base prompt) — the prompt team asked for a hard stop at save time so a
// mode can never quietly regrow into the monolith the split was escaping.
// Raised 20k → 30k on the prompt team's ask (ticket 6 close, task 1):
// qa_main sat at 19,974/20,000 with two P0 fixes unwritable.
const MODE_BLOCK_BUDGET_CHARS = intEnv('MODE_BLOCK_BUDGET_CHARS', 30_000);
const HISTORY_KEEP_PER_BLOCK = 10;
const RUN_STAMP_RETENTION_DAYS = 30;
const RUN_STAMP_LIST_LIMIT = 50;

// The run situations code can detect with certainty. A block only fires in
// the modes it is bound to; adding a NEW mode means adding a detection rule
// in chat.service — by design a code change, never an admin edit.
export const RUN_MODES = [
  'quick_answer',
  'request_thread',
  'task_step',
  'incoming_ask',
  'onboarding',
] as const;
export type RunMode = (typeof RUN_MODES)[number];

export function isRunMode(v: string): v is RunMode {
  return (RUN_MODES as readonly string[]).includes(v);
}

export interface PromptBlock {
  name: string;
  content: string;
  modes: string[];
  sort_order: number;
  enabled: boolean;
  enabled_for_user_ids: number[];
  updated_at: string;
}

export interface PromptBlockInput {
  content?: string;
  modes?: string[];
  sort_order?: number;
  enabled?: boolean;
  enabled_for_user_ids?: number[];
}

export interface PromptBlockHistoryEntry extends Omit<PromptBlock, 'updated_at'> {
  id: number;
  action: string;
  changed_at: string;
}

export interface ComposedBlocks {
  text: string;
  names: string[];
}

export interface ModeTotal {
  mode: RunMode;
  enabled_chars: number;
  budget_chars: number;
}

/** Invalid admin input — the route maps this (and only this) to a 400. */
export class PromptBlockValidationError extends Error {}

export function isValidBlockName(name: string): boolean {
  return BLOCK_NAME_RE.test(name);
}

const BLOCK_COLUMNS = `name, content, modes, sort_order, enabled, enabled_for_user_ids, updated_at`;

/**
 * The blocks a run in `mode` actually loads for `userId`: enabled, bound to
 * the mode, and either untargeted or targeting this account — in the team's
 * configured order. Failure degrades to "no blocks" (base prompt still runs);
 * it never fails the run.
 */
export async function composeBlocksForMode(mode: RunMode, userId: string): Promise<ComposedBlocks> {
  try {
    const result = await query<{ name: string; content: string }>(
      `SELECT name, content FROM prompt_blocks
       WHERE enabled = TRUE
         AND $1 = ANY(modes)
         AND (cardinality(enabled_for_user_ids) = 0 OR $2::int = ANY(enabled_for_user_ids))
       ORDER BY sort_order ASC, name ASC`,
      [mode, userId],
      BLOCK_QUERY_TIMEOUT_MS,
    );
    const parts = result.rows
      .map((r) => ({ name: r.name, content: r.content.trim() }))
      .filter((r) => r.content.length > 0);
    return {
      text: parts.length > 0 ? '\n\n' + parts.map((p) => p.content).join('\n\n') : '',
      names: parts.map((p) => p.name),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[prompt-blocks] compose failed — running on base prompt only:',
      (err as Error).message,
    );
    return { text: '', names: [] };
  }
}

export async function listPromptBlocks(): Promise<PromptBlock[]> {
  const result = await query<PromptBlock>(
    `SELECT ${BLOCK_COLUMNS} FROM prompt_blocks ORDER BY name`,
    [],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Per-mode sum of enabled block content vs the ceiling — the admin UI's live meter. */
export function computeModeTotals(blocks: readonly PromptBlock[]): ModeTotal[] {
  return RUN_MODES.map((mode) => ({
    mode,
    enabled_chars: blocks
      .filter((b) => b.enabled && b.modes.includes(mode))
      .reduce((sum, b) => sum + b.content.length, 0),
    budget_chars: MODE_BLOCK_BUDGET_CHARS,
  }));
}

async function getPromptBlock(name: string): Promise<PromptBlock | null> {
  const result = await query<PromptBlock>(
    `SELECT ${BLOCK_COLUMNS} FROM prompt_blocks WHERE name = $1`,
    [name],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

function validateInput(input: PromptBlockInput): void {
  if (input.content !== undefined && input.content.length > MAX_BLOCK_CONTENT_CHARS) {
    throw new PromptBlockValidationError('block content too long');
  }
  if (input.modes !== undefined) {
    const bad = input.modes.filter((m) => !isRunMode(m));
    if (bad.length > 0) {
      throw new PromptBlockValidationError(
        `unknown mode(s): ${bad.join(', ')} — valid: ${RUN_MODES.join(', ')}`,
      );
    }
  }
  if (
    input.sort_order !== undefined &&
    (!Number.isInteger(input.sort_order) || input.sort_order < 0 || input.sort_order > 100_000)
  ) {
    throw new PromptBlockValidationError('sort_order must be an integer between 0 and 100000');
  }
  if (
    input.enabled_for_user_ids !== undefined &&
    input.enabled_for_user_ids.some((id) => !Number.isInteger(id) || id < 1)
  ) {
    throw new PromptBlockValidationError('enabled_for_user_ids must be positive integers');
  }
}

/**
 * The per-mode ceiling: saving/enabling a block must not push any of its
 * modes past the budget. Checked against every OTHER enabled block; a
 * violation names the mode and the overflow so the editor can act on it.
 */
async function assertModeBudgets(merged: PromptBlock): Promise<void> {
  if (!merged.enabled || merged.modes.length === 0) return;
  const others = (await listPromptBlocks()).filter((b) => b.name !== merged.name && b.enabled);
  for (const mode of merged.modes) {
    const otherChars = others
      .filter((b) => b.modes.includes(mode))
      .reduce((sum, b) => sum + b.content.length, 0);
    const total = otherChars + merged.content.length;
    if (total > MODE_BLOCK_BUDGET_CHARS) {
      throw new PromptBlockValidationError(
        `mode ${mode} would hold ${total} chars of blocks — over the ${MODE_BLOCK_BUDGET_CHARS} ceiling by ${total - MODE_BLOCK_BUDGET_CHARS}`,
      );
    }
  }
}

const HISTORY_INSERT = `INSERT INTO prompt_block_history
   (block_name, action, content, modes, sort_order, enabled, enabled_for_user_ids)
   VALUES ($1, $2, $3, $4, $5, $6, $7)`;
const HISTORY_TRIM = `DELETE FROM prompt_block_history
   WHERE block_name = $1 AND id NOT IN (
     SELECT id FROM prompt_block_history
     WHERE block_name = $1 ORDER BY id DESC LIMIT ${HISTORY_KEEP_PER_BLOCK}
   )`;

/**
 * Create or update a block. Partial updates merge over the existing row;
 * creating requires content. Every save snapshots the NEW state into history
 * (rollback = PUT any older snapshot's fields back).
 */
export async function upsertPromptBlock(
  name: string,
  input: PromptBlockInput,
): Promise<PromptBlock> {
  if (!isValidBlockName(name)) throw new PromptBlockValidationError('invalid block name');
  validateInput(input);

  const existing = await getPromptBlock(name);
  if (!existing && input.content === undefined) {
    throw new PromptBlockValidationError('content is required when creating a block');
  }
  const merged: PromptBlock = {
    name,
    content: input.content ?? existing?.content ?? '',
    modes: input.modes ?? existing?.modes ?? [],
    sort_order: input.sort_order ?? existing?.sort_order ?? 100,
    enabled: input.enabled ?? existing?.enabled ?? true,
    enabled_for_user_ids: input.enabled_for_user_ids ?? existing?.enabled_for_user_ids ?? [],
    updated_at: '',
  };
  await assertModeBudgets(merged);

  return withTransaction(async (client) => {
    const saved = await client.query<PromptBlock>(
      `INSERT INTO prompt_blocks (name, content, modes, sort_order, enabled, enabled_for_user_ids)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         content = $2, modes = $3, sort_order = $4, enabled = $5,
         enabled_for_user_ids = $6, updated_at = NOW()
       RETURNING ${BLOCK_COLUMNS}`,
      [
        name,
        merged.content,
        merged.modes,
        merged.sort_order,
        merged.enabled,
        merged.enabled_for_user_ids,
      ],
    );
    await client.query(HISTORY_INSERT, [
      name,
      existing ? 'update' : 'create',
      merged.content,
      merged.modes,
      merged.sort_order,
      merged.enabled,
      merged.enabled_for_user_ids,
    ]);
    await client.query(HISTORY_TRIM, [name]);
    return saved.rows[0];
  });
}

/** Delete a block (its pre-delete state is kept as the last history snapshot). */
export async function deletePromptBlock(name: string): Promise<boolean> {
  const existing = await getPromptBlock(name);
  if (!existing) return false;
  await withTransaction(async (client) => {
    await client.query(HISTORY_INSERT, [
      name,
      'delete',
      existing.content,
      existing.modes,
      existing.sort_order,
      existing.enabled,
      existing.enabled_for_user_ids,
    ]);
    await client.query(HISTORY_TRIM, [name]);
    await client.query(`DELETE FROM prompt_blocks WHERE name = $1`, [name]);
  });
  return true;
}

export async function getPromptBlockHistory(name: string): Promise<PromptBlockHistoryEntry[]> {
  const result = await query<PromptBlockHistoryEntry>(
    `SELECT id, block_name AS name, action, content, modes, sort_order, enabled,
            enabled_for_user_ids, changed_at
     FROM prompt_block_history
     WHERE block_name = $1
     ORDER BY id DESC
     LIMIT ${HISTORY_KEEP_PER_BLOCK}`,
    [name],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Record which mode a run resolved to and which blocks it loaded. Best-effort
 * by contract (the caller fire-and-forgets); each write also prunes expired
 * stamps so the table never needs a separate janitor.
 */
export async function stampRunMode(
  runId: string,
  userId: string,
  threadId: number | null,
  mode: RunMode,
  blockNames: readonly string[],
): Promise<void> {
  await query(
    `INSERT INTO run_prompt_stamps (run_id, user_id, thread_id, mode, block_names)
     VALUES ($1, $2::int, $3, $4, $5)
     ON CONFLICT (run_id) DO NOTHING`,
    [runId, userId, threadId, mode, [...blockNames]],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  await query(
    `DELETE FROM run_prompt_stamps WHERE created_at < NOW() - INTERVAL '${RUN_STAMP_RETENTION_DAYS} days'`,
    [],
    BLOCK_QUERY_TIMEOUT_MS,
  );
}

export interface RunStamp {
  run_id: string;
  user_id: number;
  thread_id: number | null;
  mode: string;
  block_names: string[];
  created_at: string;
}

export async function listRunStamps(threadId?: number): Promise<RunStamp[]> {
  const result = await query<RunStamp>(
    `SELECT run_id, user_id, thread_id, mode, block_names, created_at
     FROM run_prompt_stamps
     WHERE ($1::int IS NULL OR thread_id = $1)
     ORDER BY created_at DESC
     LIMIT ${RUN_STAMP_LIST_LIMIT}`,
    [threadId ?? null],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
