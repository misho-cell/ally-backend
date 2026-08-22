import * as fs from 'fs';
import * as path from 'path';

// The exact bug class from 23-24 August, three times: a tool is added with a
// `name: '...'` literal in the in-app registry (chat.service.ts), reported
// BUILT and "reachable in every owner-side mode", and the second registration
// — `server.registerTool('...', ...)` in mcp/mcpServer.ts — is simply
// forgotten. invite_contact, get_intro_status and remove_contact_from_network
// all shipped this way. Two registries that must move together and nothing
// checked that they did.
//
// This test reads both source files as text and checks a curated list of
// tool names — every one confirmed dual-surface by a live `tools/list` probe
// on production, 23-24 Aug — against BOTH. Add a name here the moment a new
// tool is meant to work from both the in-app chat and the MCP connector.
const REQUIRED_ON_BOTH: readonly string[] = [
  'allow_contacting_me',
  'ask_contact',
  'block_contact',
  'create_task',
  'exclude_contact',
  'finish_task',
  'get_contact_facts',
  'get_country_channels',
  'get_group_connectors',
  'get_intro_status',
  'get_my_tasks',
  'get_netai_info',
  'get_pending_updates',
  'get_top_connectors',
  'get_user_notes',
  'grant_task_permission',
  'invite_contact',
  'list_blocked_contacts',
  'mark_contact_deceased',
  'queue_result',
  'remove_contact_exclusion',
  'remove_contact_from_network',
  'request_introduction',
  'retract_contact_fact',
  'save_contact_fact',
  'save_user_note',
  'search_by_insight',
  'search_second_degree',
  'set_task_brief',
  'set_task_wake',
  'stop_contacting_me',
  'unblock_contact',
  'update_task',
];

const CHAT_SERVICE_PATH = path.join(__dirname, '../../chat.service.ts');
const MCP_SERVER_PATH = path.join(__dirname, '../mcpServer.ts');

function namesInChatService(): Set<string> {
  const src = fs.readFileSync(CHAT_SERVICE_PATH, 'utf8');
  const names = new Set<string>();
  // Every AnthropicTool literal carries `name: '<tool_name>',` on its own line.
  for (const m of src.matchAll(/^\s*name:\s*'([a-z_]+)',?\s*$/gm)) names.add(m[1]);
  return names;
}

function namesInMcpServer(): Set<string> {
  const src = fs.readFileSync(MCP_SERVER_PATH, 'utf8');
  const names = new Set<string>();
  for (const m of src.matchAll(/registerTool\(\s*\n?\s*'([a-z_]+)'/g)) names.add(m[1]);
  return names;
}

describe('MCP connector / in-app tool registry parity', () => {
  const inApp = namesInChatService();
  const connector = namesInMcpServer();

  it.each(REQUIRED_ON_BOTH)('%s is registered in the in-app tool list', (name) => {
    expect(inApp.has(name)).toBe(true);
  });

  it.each(REQUIRED_ON_BOTH)('%s is registered on the MCP connector', (name) => {
    expect(connector.has(name)).toBe(true);
  });
});
