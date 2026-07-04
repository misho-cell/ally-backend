import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { recordFixedUsage } from '../costLedger.service';
import {
  mcpCheckInbox,
  mcpGetContactProfile,
  mcpGetNetworkStats,
  mcpRequestIntroduction,
  mcpRespondToRequest,
  mcpSearchByInsight,
  mcpSearchContacts,
  mcpSearchSecondDegree,
  McpToolPayload,
} from './handlers';
import {
  MCP_SERVER_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  PARAM_TEXTS,
  PROMPT_TEXTS,
  TOOL_TEXTS,
} from './texts';

const MCP_USAGE_KIND = 'mcp_tool';
const MCP_USAGE_PROVIDER = 'ally';
const MCP_USAGE_PRICE_KEY = 'mcp.tool_call';

const GENERIC_TOOL_ERROR =
  "Tool failed on the server side. Tell the user something went wrong on Ally's end; " +
  'do not invent results.';

interface McpTextResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Runs one tool call: records it in the cost ledger (fire-and-forget — the
 * ledger must never break the tool), executes the handler, and converts the
 * payload to MCP text content. Raw errors never reach the client.
 */
async function runTool(
  userId: string,
  toolName: string,
  run: () => Promise<McpToolPayload>,
): Promise<McpTextResult> {
  recordFixedUsage({
    userId,
    kind: MCP_USAGE_KIND,
    provider: MCP_USAGE_PROVIDER,
    priceKey: MCP_USAGE_PRICE_KEY,
    label: toolName,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[mcp] ledger write failed for ${toolName}:`, err);
  });

  try {
    const payload = await run();
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[mcp] ${toolName} failed:`, err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: GENERIC_TOOL_ERROR }) }],
      isError: true,
    };
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

function registerSearchTools(server: McpServer, userId: string): void {
  server.registerTool(
    'search_contacts',
    {
      title: TOOL_TEXTS.search_contacts.title,
      description: TOOL_TEXTS.search_contacts.description,
      inputSchema: {
        tag: z.string().optional().describe(PARAM_TEXTS.tag),
        name: z.string().optional().describe(PARAM_TEXTS.name),
      },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'search_contacts', () => mcpSearchContacts(userId, args)),
  );
  server.registerTool(
    'search_by_insight',
    {
      title: TOOL_TEXTS.search_by_insight.title,
      description: TOOL_TEXTS.search_by_insight.description,
      inputSchema: { query: z.string().describe(PARAM_TEXTS.insightQuery) },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'search_by_insight', () => mcpSearchByInsight(userId, args)),
  );
  server.registerTool(
    'search_second_degree',
    {
      title: TOOL_TEXTS.search_second_degree.title,
      description: TOOL_TEXTS.search_second_degree.description,
      inputSchema: { query: z.string().describe(PARAM_TEXTS.secondDegreeQuery) },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'search_second_degree', () => mcpSearchSecondDegree(userId, args)),
  );
}

function registerProfileTools(server: McpServer, userId: string): void {
  server.registerTool(
    'get_network_stats',
    {
      title: TOOL_TEXTS.get_network_stats.title,
      description: TOOL_TEXTS.get_network_stats.description,
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'get_network_stats', () => mcpGetNetworkStats(userId)),
  );
  server.registerTool(
    'get_contact_profile',
    {
      title: TOOL_TEXTS.get_contact_profile.title,
      description: TOOL_TEXTS.get_contact_profile.description,
      inputSchema: { contact_ref: z.string().describe(PARAM_TEXTS.contactRef) },
      annotations: READ_ONLY,
    },
    (args) => runTool(userId, 'get_contact_profile', () => mcpGetContactProfile(userId, args)),
  );
}

function registerIntroTools(server: McpServer, userId: string): void {
  server.registerTool(
    'request_introduction',
    {
      title: TOOL_TEXTS.request_introduction.title,
      description: TOOL_TEXTS.request_introduction.description,
      inputSchema: {
        mediator_name: z.string().describe(PARAM_TEXTS.mediatorName),
        mediator_ref: z.string().optional().describe(PARAM_TEXTS.mediatorRef),
        target_name: z.string().describe(PARAM_TEXTS.targetName),
        message: z.string().describe(PARAM_TEXTS.introMessage),
      },
      annotations: DESTRUCTIVE,
    },
    (args) => runTool(userId, 'request_introduction', () => mcpRequestIntroduction(userId, args)),
  );
  server.registerTool(
    'check_my_inbox',
    {
      title: TOOL_TEXTS.check_my_inbox.title,
      description: TOOL_TEXTS.check_my_inbox.description,
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool(userId, 'check_my_inbox', () => mcpCheckInbox(userId)),
  );
  server.registerTool(
    'respond_to_request',
    {
      title: TOOL_TEXTS.respond_to_request.title,
      description: TOOL_TEXTS.respond_to_request.description,
      inputSchema: {
        request_ref: z.string().describe(PARAM_TEXTS.requestRef),
        accept: z.boolean().describe(PARAM_TEXTS.accept),
        response: z.string().optional().describe(PARAM_TEXTS.responseNote),
      },
      annotations: DESTRUCTIVE,
    },
    (args) => runTool(userId, 'respond_to_request', () => mcpRespondToRequest(userId, args)),
  );
}

function promptMessage(text: string): {
  messages: { role: 'user'; content: { type: 'text'; text: string } }[];
} {
  return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

// Ready-made scenarios for claude.ai's "+" menu. They carry user-message
// strength — stronger than any passive hint the connector can give.
function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'find_in_network',
    {
      title: PROMPT_TEXTS.find_in_network.title,
      description: PROMPT_TEXTS.find_in_network.description,
      argsSchema: { field: z.string().describe(PROMPT_TEXTS.find_in_network.argField) },
    },
    ({ field }) => promptMessage(PROMPT_TEXTS.find_in_network.build(field)),
  );
  server.registerPrompt(
    'request_intro',
    {
      title: PROMPT_TEXTS.request_intro.title,
      description: PROMPT_TEXTS.request_intro.description,
      argsSchema: {
        who: z.string().describe(PROMPT_TEXTS.request_intro.argWho),
        purpose: z.string().describe(PROMPT_TEXTS.request_intro.argPurpose),
      },
    },
    ({ who, purpose }) => promptMessage(PROMPT_TEXTS.request_intro.build(who, purpose)),
  );
  server.registerPrompt(
    'network_overview',
    {
      title: PROMPT_TEXTS.network_overview.title,
      description: PROMPT_TEXTS.network_overview.description,
    },
    () => promptMessage(PROMPT_TEXTS.network_overview.build()),
  );
}

/**
 * One MCP server per request, bound to the authenticated user. Nothing is
 * shared between requests, so sessions can never bleed into each other.
 */
export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );
  registerSearchTools(server, userId);
  registerProfileTools(server, userId);
  registerIntroTools(server, userId);
  registerPrompts(server);
  return server;
}
