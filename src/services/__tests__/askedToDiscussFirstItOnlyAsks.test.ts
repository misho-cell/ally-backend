jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  DISCUSS_MAX_TOKENS,
  DISCUSS_TURN_NOTE,
  setDiscussion,
  threadInDiscussion,
} from '../discussFirst';
import { SET_DISCUSSION_TOOL } from '../tools/setDiscussion';

/**
 * Board #67: asked to talk first, Netai went straight to leads. #8779 group 4
 * (the founder, 4 Nov): the owner's words are the model's to read — it calls
 * set_discussion — and the conversation keeps the mode; the server enforces it.
 * Fictional ids only.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the mode the model sets', () => {
  it('is set on the owner’s own conversation only, and cleared on „act now"', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    await expect(setDiscussion(7001, '501', true)).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE id = $1 AND user_id = $2::int');
    expect(params).toEqual([7001, '501', true]);
    await setDiscussion(7001, '501', false);
    expect(mockQuery.mock.calls[1][1]).toEqual([7001, '501', false]);
  });

  it('is read off the thread, and a failed read is not a discussion', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ on: true }], rowCount: 1 } as never);
    await expect(threadInDiscussion(7001)).resolves.toBe(true);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await expect(threadInDiscussion(7001)).resolves.toBe(false);
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(threadInDiscussion(7001)).resolves.toBe(false);
  });

  it('is the model’s tool, in the app’s run', () => {
    expect(SET_DISCUSSION_TOOL.name).toBe('set_discussion');
    expect(chat).toContain('  SET_DISCUSSION_TOOL,\n');
    expect(chat).toContain("case 'set_discussion': {");
  });
});

describe('what a discussion turn is', () => {
  it('holds only set_discussion and asks questions, never leads or a plan', () => {
    expect(DISCUSS_TURN_NOTE).toContain('This turn holds one tool only, set_discussion');
    expect(DISCUSS_TURN_NOTE).toContain('no search, no plan, no leads');
    expect(DISCUSS_TURN_NOTE).toContain('Do not tell them what their business is');
    // The tester's 1095 (32605, 32607): a filled profile was read back as „tell me about your winery".
    expect(DISCUSS_TURN_NOTE).toContain('not even from their saved profile');
    expect(DISCUSS_TURN_NOTE).toContain('ask one or two short questions');
    expect(DISCUSS_MAX_TOKENS).toBeGreaterThan(0);
  });

  it('is wired into the run, the tool gate and the goal opener', () => {
    expect(chat).toContain(
      'const discussing = !ownerAbsent && !otherTap && (await threadInDiscussion(threadId));',
    );
    expect(chat).toContain('...(discussing && { maxTokens: DISCUSS_MAX_TOKENS }),');
    expect(chat).toContain('(runInDiscussion.has(runId) && name !== SET_DISCUSSION_TOOL_NAME))');
    expect(chat).toContain('if (await threadInDiscussion(threadId)) {');
    expect(chat).not.toContain('discussionHolds');
  });
});

/** The tester's 1096 (32608): GPT wrote the discussion turn's answer without its rule. */
describe('the discussion rule reaches GPT too', () => {
  it('is in the prompt GPT writes the final answer from', () => {
    const gptPrompt = chat.slice(
      chat.indexOf(
        'const writeWith = async (model: string): ReturnType<typeof writeFinalAnswer> =>',
      ),
    );
    expect(gptPrompt.slice(0, 1200)).toContain('shortTurnNote +');
  });
});
