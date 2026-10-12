jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { moveWakeAfterAnswer, nextWakeText } from '../taskStore.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const WAKE_BEFORE = '2026-10-08 22:31:35.635912';
const HOURS = 24;

/** 2576 (RW-001): after a helper's answer the goal's next check moves. */
describe('an answer moves the goal’s next check', () => {
  beforeEach(() => mockQuery.mockReset());

  it('moves the wake only when the run left it exactly as it was', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    expect(await moveWakeAfterAnswer(20796, WAKE_BEFORE, HOURS)).toBe(true);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('next_wake_at::text IS NOT DISTINCT FROM $2');
    expect(String(sql)).toContain("status = 'open'");
    expect(params).toEqual([20796, WAKE_BEFORE, HOURS]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('reports false when the run chose its own wake', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    expect(await moveWakeAfterAnswer(20796, WAKE_BEFORE, HOURS)).toBe(false);
  });

  it('reads the wake as stored text, microseconds and all', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ wake: WAKE_BEFORE }] } as never);
    expect(await nextWakeText(20796)).toBe(WAKE_BEFORE);
    expect(String(mockQuery.mock.calls[0][0])).toContain('next_wake_at::text');
  });

  it('touches nothing for an id that is not an id', async () => {
    expect(await moveWakeAfterAnswer(Number.NaN, null, HOURS)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is called after the answer run, with the wake read before it', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    const read = engine.indexOf('const wakeBeforeRun = await nextWakeText(taskId);');
    const run = engine.indexOf('buildShownAnswersWakeEvent(arrived)', read);
    const move = engine.indexOf('moveWakeAfterAnswer(taskId, wakeBeforeRun', run);
    expect(read).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(read);
    expect(move).toBeGreaterThan(run);
  });
});
