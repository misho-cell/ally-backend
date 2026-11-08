import { readFileSync } from 'fs';
import { join } from 'path';

const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
}));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));

import { wakesThisTick } from '../taskEngine.service';
import { countDueTasks, leaseTaskWakes } from '../taskStore.service';

/**
 * Misho's yes, 8 Nov: about 3,500 wakes were due at two a minute, so a goal's
 * scheduled check came days late. A tick takes ten while more than a hundred
 * wait, two otherwise; what it takes is leased so an overlapping tick cannot
 * take it again.
 */
const ENGINE = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

describe('the wake queue', () => {
  beforeEach(() => mockQuery.mockReset());

  it('takes two a minute as before, and ten while a backlog waits', () => {
    expect(wakesThisTick(0)).toBe(2);
    expect(wakesThisTick(100)).toBe(2);
    expect(wakesThisTick(101)).toBe(10);
  });

  it('counts only as far as it needs to tell a backlog', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ n: 101 }] });
    await expect(countDueTasks(101)).resolves.toBe(101);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('next_wake_at <= NOW()');
    expect(sql).toContain('plan_change_requested_at IS NULL');
    expect(sql).toContain('LIMIT $1');
    expect(params).toEqual([101]);
  });

  it('leases what a tick took, and leases nothing for nothing', async () => {
    await leaseTaskWakes([], 30);
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockResolvedValueOnce({ rowCount: 2 });
    await leaseTaskWakes([7, 8], 30);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET next_wake_at = NOW() + make_interval(mins => $2)');
    expect(params).toEqual([[7, 8], 30]);
  });

  it('is sized and leased before the first goal is worked', () => {
    const tick = ENGINE.slice(ENGINE.indexOf('async function tick()'));
    const sized = tick.indexOf(
      'getDueTasks(wakesThisTick(await countDueTasks(BACKLOG_WAKES + 1)))',
    );
    const leased = tick.indexOf('await leaseTaskWakes(');
    const worked = tick.indexOf('for (const task of due) {');
    expect(sized).toBeGreaterThan(-1);
    expect(leased).toBeGreaterThan(sized);
    expect(worked).toBeGreaterThan(leased);
  });
});
