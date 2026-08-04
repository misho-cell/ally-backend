import { query } from '../db/postgres/client';

const BLOCK_QUERY_TIMEOUT_MS = 5_000;
// Block names are API-addressable identifiers, not free text.
const BLOCK_NAME_RE = /^[a-z0-9_]{2,40}$/;
const MAX_BLOCK_CONTENT_CHARS = 20_000;

export interface PromptBlock {
  name: string;
  content: string;
  updated_at: string;
}

export function isValidBlockName(name: string): boolean {
  return BLOCK_NAME_RE.test(name);
}

/**
 * Fetch the requested blocks and join them in the REQUESTED order (the
 * composition matrix decides precedence, not the database). Missing or empty
 * blocks are skipped, so an unconfigured mode costs nothing.
 */
export async function composePromptBlocks(names: readonly string[]): Promise<string> {
  if (names.length === 0) return '';
  const result = await query<{ name: string; content: string }>(
    `SELECT name, content FROM prompt_blocks WHERE name = ANY($1)`,
    [names],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  const byName = new Map(result.rows.map((r) => [r.name, r.content]));
  const parts = names
    .map((n) => (byName.get(n) ?? '').trim())
    .filter((content) => content.length > 0);
  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

export async function listPromptBlocks(): Promise<PromptBlock[]> {
  const result = await query<PromptBlock>(
    `SELECT name, content, updated_at FROM prompt_blocks ORDER BY name`,
    [],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export async function upsertPromptBlock(name: string, content: string): Promise<PromptBlock> {
  if (!isValidBlockName(name)) throw new Error('invalid block name');
  if (content.length > MAX_BLOCK_CONTENT_CHARS) throw new Error('block content too long');
  const result = await query<PromptBlock>(
    `INSERT INTO prompt_blocks (name, content)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET content = $2, updated_at = NOW()
     RETURNING name, content, updated_at`,
    [name, content],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return result.rows[0];
}
