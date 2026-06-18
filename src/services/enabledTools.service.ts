import { query } from '../db/postgres/client';

export interface EnabledTool {
  tool_key: string;
  tool_label: string;
  is_enabled: boolean;
}

export async function getEnabledToolKeys(): Promise<string[]> {
  const result = await query<{ tool_key: string }>(
    'SELECT tool_key FROM enabled_tools WHERE is_enabled = true',
  );
  return result.rows.map((r) => r.tool_key);
}

export async function getAllEnabledTools(): Promise<EnabledTool[]> {
  const result = await query<EnabledTool>(
    'SELECT tool_key, tool_label, is_enabled FROM enabled_tools ORDER BY tool_key',
  );
  return result.rows;
}

export async function toggleEnabledTool(toolKey: string): Promise<EnabledTool> {
  const result = await query<EnabledTool>(
    `UPDATE enabled_tools
     SET is_enabled = NOT is_enabled, updated_at = NOW()
     WHERE tool_key = $1
     RETURNING tool_key, tool_label, is_enabled`,
    [toolKey],
  );
  if (result.rows.length === 0) {
    throw new Error(`Tool not found: ${toolKey}`);
  }
  return result.rows[0];
}
