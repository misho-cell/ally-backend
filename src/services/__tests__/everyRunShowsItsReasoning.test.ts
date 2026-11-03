const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SUMMARIZED_THINKING, tracedInFull } from '../reasoningSummary';

/** Misho, 3 Nov: real people's runs are debugged in full for now, not the test seats. */
describe('the reasoning summary and the kept prompt', () => {
  beforeEach(() => mockQuery.mockReset());

  it('are on for a real person', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await tracedInFull('101')).toBe(true);
  });

  it('are off for a test seat', async () => {
    mockQuery.mockResolvedValue({ rows: [{ user_id: 102 }] });
    expect(await tracedInFull('102')).toBe(false);
  });

  it('are off when the seat check fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    expect(await tracedInFull('103')).toBe(false);
  });

  it('ask only for a readable summary of the adaptive thinking that runs anyway', () => {
    expect(SUMMARIZED_THINKING).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  it('ride on the main model\u2019s calls only, never beside a forced tool', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('const tracedFully = await tracedInFull(ctx.userId);');
    expect(chat).toContain('tracedFully && model === MODEL && opts.forceTool === undefined');
    expect(chat).toContain('if (tracedFully) void recordPromptSent(ctx.runId, systemPrompt);');
  });
});
