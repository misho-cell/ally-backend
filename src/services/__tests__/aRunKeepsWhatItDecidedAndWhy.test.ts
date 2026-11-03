const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import {
  promptHash,
  recordModelCall,
  recordPromptSent,
  recordReplyDropped,
  recordReplyRewritten,
} from '../runTraceRecorder.service';
import { promptTexts } from '../runTraceExtras.service';

/** Misho, 3 Nov: what a run decided and why, kept for the run trace. */
beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('the exact prompt a round was sent', () => {
  it('is kept compressed, once per text, and listed on the run', async () => {
    await recordPromptSent('run-a', 'SYSTEM PROMPT v1');
    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toContain('INSERT INTO run_prompt_texts');
    expect(mockQuery.mock.calls[0][1][0]).toBe(promptHash('SYSTEM PROMPT v1'));
    expect(sqls[1]).toContain('UPDATE run_prompt_stamps');
    await recordPromptSent('run-b', 'SYSTEM PROMPT v1');
    expect(
      mockQuery.mock.calls
        .map((c) => String(c[0]))
        .filter((q) => q.includes('INSERT INTO run_prompt_texts')),
    ).toHaveLength(1);
  });

  it('never fails the run when the write fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    await expect(recordPromptSent('run-d', 'ANOTHER PROMPT')).resolves.toBeUndefined();
  });

  it('is read back whole, phones redacted', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ hash: 'h', text_gzip: gzipSync(Buffer.from('call +995555123456 now')) }],
    });
    const texts = await promptTexts(['h']);
    expect(texts.get('h')).not.toContain('555123456');
    expect(texts.get('h')).toContain('call');
  });
});

describe('the server’s own steps', () => {
  it('keeps a model round, a dropped reply with its rule, and a rewrite', async () => {
    await recordModelCall('run-e', {
      model: 'claude-sonnet-5',
      stop_reason: 'end_turn',
      duration_ms: 1200,
      input_tokens: 10,
      output_tokens: 47,
      cache_read_tokens: 9000,
    });
    await recordReplyDropped(
      'run-e',
      'quiet_after_decline (Misho 1489 გ)',
      'Lika knows nobody; shall I ask Giorgi?',
    );
    await recordReplyRewritten('run-e', 'gpt', 'Claude said this', 'GPT said that');
    const kinds = mockQuery.mock.calls
      .filter((c) => String(c[0]).includes('INSERT INTO run_trace_events'))
      .map((c) => c[1][1]);
    expect(kinds).toEqual(['model_call', 'reply_dropped', 'reply_rewritten']);
  });

  it('skips a rewrite that changed nothing', async () => {
    await recordReplyRewritten('run-f', 'gpt', 'same words', 'same words ');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is written at every quiet end and after every rewrite, and each model round', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(
      chat.match(
        /await dropQuietRunTrail\(\s*userId,\s*threadId,\s*runId,\s*'[^']+',\s*finalText,?\s*\);/gu,
      ),
    ).toHaveLength(5);
    expect(chat).toContain(
      'void recordReplyRewritten(runId, rewritten.model, extractText(response.content), finalText);',
    );
    expect(chat).toContain('void recordModelCall(ctx.runId, {');
    expect(chat).toContain('if (tracedFully) void recordPromptSent(ctx.runId, systemPrompt);');
  });
});
