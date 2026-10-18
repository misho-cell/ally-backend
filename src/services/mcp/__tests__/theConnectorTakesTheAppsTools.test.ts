jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
  default: { end: jest.fn() },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ALL_TOOL_DEFINITIONS, ALWAYS_ON_TOOLS } from '../../chat.service';
import { TOOL_TEXTS } from '../texts';
import { APP_ONLY_TOOLS, runSharedTool, sharedAppTools } from '../sharedTools';
import { takesAnotherNumber } from '../appToolShape';
import { encodeContactRef } from '../contactRef';

const APP_TOOLS = [...ALWAYS_ON_TOOLS, ...Object.values(ALL_TOOL_DEFINITIONS)];
const OWN = new Set(Object.keys(TOOL_TEXTS));
const SERVER = readFileSync(join(__dirname, '..', 'mcpServer.ts'), 'utf8');

beforeAll(() => {
  process.env.MCP_REF_SECRET = 'test-secret-for-refs';
});

/** #5677 (the founder's D818): one source — every app tool reaches the connector or says why not. */
describe('the connector takes the app’s tools', () => {
  const shared = new Set(sharedAppTools(APP_TOOLS, OWN).map((t) => t.name));

  it('now carries what the founder found missing', () => {
    expect(shared.has('record_who_helped')).toBe(true);
    expect(shared.has('list_my_contacts')).toBe(true);
  });

  it('never carries a tool that draws app buttons or hands out a number', () => {
    for (const name of ['present_choices', 'get_own_contact_number', 'web_search', 'relay_ask']) {
      expect(shared.has(name)).toBe(false);
    }
  });

  it('accounts for every app tool: the connector’s own, shared, or app-only with a reason', () => {
    for (const tool of APP_TOOLS) {
      const placed =
        OWN.has(tool.name) ||
        shared.has(tool.name) ||
        APP_ONLY_TOOLS.has(tool.name) ||
        takesAnotherNumber(tool);
      expect(`${tool.name}: ${placed}`).toBe(`${tool.name}: true`);
    }
  });

  it('names no app-only tool the app does not have', () => {
    const names = new Set(APP_TOOLS.map((t) => t.name));
    for (const name of APP_ONLY_TOOLS.keys()) {
      if (name === 'share_contact_number_with_asker' || name === 'send_answer_to_asker') continue;
      expect(`${name}: ${names.has(name)}`).toBe(`${name}: true`);
    }
  });

  it('knows its own tools by the texts it registers them with', () => {
    const registered = [...SERVER.matchAll(/registerTool\(\s*'([a-z_]+)'/gu)].map((m) => m[1]);
    for (const name of registered) expect(`${name}: ${OWN.has(name)}`).toBe(`${name}: true`);
  });
});

describe('a shared call', () => {
  const USER = '501';

  it('runs the app’s handler with the number, and returns refs, never the number', async () => {
    const ref = encodeContactRef(USER, '+995 555 12 34 56');
    const run = jest
      .fn()
      .mockResolvedValue({ recorded: true, helper: { name: 'Nino', phone: '+995 555 12 34 56' } });

    const payload = await runSharedTool(
      USER,
      'record_who_helped',
      { contact_ref: ref, what_was_solved: 'x' },
      run,
    );

    expect(run).toHaveBeenCalledWith('record_who_helped', {
      phone: '+995 555 12 34 56',
      what_was_solved: 'x',
    });
    expect(JSON.stringify(payload)).not.toContain('555');
    expect(payload).toEqual({ recorded: true, helper: { name: 'Nino', contact_ref: ref } });
  });

  it('refuses a ref minted for someone else, and runs nothing', async () => {
    const run = jest.fn();
    const payload = await runSharedTool(
      USER,
      'record_who_helped',
      { contact_ref: encodeContactRef('999', '+995555000000') },
      run,
    );

    expect(run).not.toHaveBeenCalled();
    expect(payload).toHaveProperty('error');
  });

  it('scrubs a number the app wrote anywhere else in its answer', async () => {
    const run = jest.fn().mockResolvedValue({ note: 'call +995 555 98 76 54 today' });
    const payload = await runSharedTool(USER, 'list_status', {}, run);

    expect(JSON.stringify(payload)).not.toContain('98 76 54');
  });
});
