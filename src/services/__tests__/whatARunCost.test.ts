jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { getRunCostsForThread } from '../runCost.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Row 291 (widened): the admin thread read shows what each run did and said,
 * and now what it cost — the seat could not tell a wallet-burning reply from a
 * cheap one.
 */
beforeEach(() => jest.clearAllMocks());

describe('what a run cost', () => {
  it('adds up each run by run_id, from the thread messages and tool calls', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          run_id: 'ad4ae736',
          started_at: '2026-09-30T11:17:45Z',
          cost_usd: '0.1453',
          model_calls: '2',
          input_tokens: '339',
          output_tokens: '6502',
          cache_write_tokens: '22119',
          cache_read_tokens: '81338',
        },
      ],
      rowCount: 1,
    } as never);

    const runs = await getRunCostsForThread(27260);

    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('FROM conversations WHERE thread_id = $1');
    expect(String(sql)).toContain('FROM tool_call_log WHERE thread_id = $1');
    expect(String(sql)).toContain('JOIN runs r ON r.run_id = u.run_id');
    expect(params).toEqual([27260, expect.any(Number)]);
    expect(timeout).toBeGreaterThan(0);
    expect(runs).toEqual([
      {
        run_id: 'ad4ae736',
        started_at: '2026-09-30T11:17:45Z',
        cost_usd: 0.1453,
        model_calls: 2,
        input_tokens: 339,
        output_tokens: 6502,
        cache_write_tokens: 22119,
        cache_read_tokens: 81338,
      },
    ]);
  });

  it('reads a run with no token counts as zero, not as NaN', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          run_id: 'r1',
          started_at: 'x',
          cost_usd: null,
          model_calls: '0',
          input_tokens: null,
          output_tokens: null,
          cache_write_tokens: null,
          cache_read_tokens: null,
        },
      ],
      rowCount: 1,
    } as never);

    const [run] = await getRunCostsForThread(1);
    expect(run.cost_usd).toBe(0);
    expect(run.input_tokens).toBe(0);
  });

  it('lets a failed read reach the route, which answers 500', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    await expect(getRunCostsForThread(1)).rejects.toThrow('timeout');
  });

  it('is part of the admin thread read', () => {
    // Source-level, as the other route guards here: no supertest in this repo.
    const ADMIN = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const handler = ADMIN.slice(ADMIN.indexOf("'/threads/:id/messages'"));
    expect(handler).toContain('getRunCostsForThread(threadId),');
    expect(handler).toContain('run_costs: runCosts,');
  });
});
