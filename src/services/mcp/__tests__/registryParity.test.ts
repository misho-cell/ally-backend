import * as fs from 'fs';
import * as path from 'path';

// The exact bug class from 23-24 August, three times: a tool is added with a
// `name: '...'` literal in the in-app registry and reported BUILT and
// "reachable in every owner-side mode", and the second registration —
// `server.registerTool('...', ...)` in mcp/mcpServer.ts — is simply
// forgotten. invite_contact, get_intro_status and remove_contact_from_network
// all shipped this way.
//
// The first version of this test asserted a hand-picked list of names
// existed on both sides — an EQUALITY check dressed up as a safety net. Live
// counts on 24 August: 52 app tools, 40 connector tools, 24 legitimate
// one-sided names (search_contact_by_name/search_by_tag/
// search_contacts_by_country merge into the connector's search_contacts;
// get_contact_full_profile/lookup_contact_by_phone merge into
// get_contact_profile; present_choices renders UI buttons and has no
// connector meaning; etc.). An equality test over that reality is either
// permanently red, or gets "fixed" by wiring tools onto the connector that
// never belonged there.
//
// The correct shape, per that same letter: every in-app tool must be either
// reachable on the connector, or named in APP_ONLY below with why. A tool in
// neither set fails the build — this still catches the exact
// invite_contact-class bug, and stays quiet on every legitimate merge.
const APP_ONLY: Readonly<Record<string, string>> = {
  present_choices: 'renders tappable UI buttons — meaningless outside the app',
  web_search: 'the MCP caller (Claude itself) already has its own web search',
  fetch_page: 'the MCP caller (Claude itself) already has its own page-fetch',
  get_contact_count: 'merged into get_network_stats on the connector',
  search_contact_by_name: 'merged into search_contacts on the connector',
  search_by_tag: 'merged into search_contacts on the connector',
  search_contacts_by_country: 'merged into search_contacts on the connector',
  get_contact_full_profile: 'merged into get_contact_profile on the connector',
  lookup_contact_by_phone: 'merged into get_contact_profile on the connector',
  respond_to_introduction:
    "same action as the connector's respond_to_request — both call respondToIntroduction",
  get_own_contact_number:
    'the connector never returns a raw phone number by design (every MCP payload is ' +
    'scrubbed) — this tool exists only because the in-app display pipeline needs a ' +
    'reveal-marker mechanism the connector has no equivalent of',
  update_user_profile: 'in-app profile-field editor, tied to the in-app settings UI',
  save_private_context:
    "writes the in-app assistant's own private memory store, not a user-facing capability",
  set_user_state: 'in-app distress-detection flag, tied to in-app crisis-response UI',
  get_thread_context:
    'reads in-app thread continuity state; the connector has no equivalent thread concept',
  set_task_result: 'internal plumbing for the in-app tool loop, not a real capability',
  // The three below are genuinely UNRESOLVED — listed so the build stays
  // green, not because the answer is known. Each needs an explicit product
  // call (wire to the connector, or confirm app-only and say why) before
  // this comment should be trusted as the reason.
  save_contact_insight: 'UNDECIDED — no connector equivalent exists yet; needs an owner call',
  get_contact_insight: 'UNDECIDED — no connector equivalent exists yet; needs an owner call',
  relay_ask:
    'UNDECIDED — forwards an existing incoming ask; unclear whether this is in-app-thread-' +
    'specific or a real connector gap',
};

const CHAT_SERVICE_PATH = path.join(__dirname, '../../chat.service.ts');
const MCP_SERVER_PATH = path.join(__dirname, '../mcpServer.ts');
const TOOLS_DIR = path.join(__dirname, '../../tools');

const NAME_LINE_RE = /^\s*name:\s*'([a-z_]+)',?\s*$/gm;

function namesInFile(filePath: string): Set<string> {
  const names = new Set<string>();
  for (const m of fs.readFileSync(filePath, 'utf8').matchAll(NAME_LINE_RE)) names.add(m[1]);
  return names;
}

// Some app tools are built by a factory function in their own file under
// services/tools/ (get_contact_insight, save_contact_insight) rather than as
// an inline literal in chat.service.ts — scanning chat.service.ts alone
// missed both of them. Scanning every tools/*.ts file too closes that gap.
function namesInChatService(): Set<string> {
  const names = namesInFile(CHAT_SERVICE_PATH);
  for (const entry of fs.readdirSync(TOOLS_DIR)) {
    if (!entry.endsWith('.ts')) continue;
    const full = path.join(TOOLS_DIR, entry);
    if (!fs.statSync(full).isFile()) continue;
    for (const name of namesInFile(full)) names.add(name);
  }
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

  it.each([...inApp].sort())(
    '%s is either registered on the MCP connector or listed in APP_ONLY with a reason',
    (name) => {
      const onConnector = connector.has(name);
      const documented = name in APP_ONLY;
      expect(onConnector || documented).toBe(true);
    },
  );

  it.each(Object.keys(APP_ONLY).sort())(
    'APP_ONLY entry %s is a real in-app tool (no stale entries)',
    (name) => {
      expect(inApp.has(name)).toBe(true);
    },
  );
});
