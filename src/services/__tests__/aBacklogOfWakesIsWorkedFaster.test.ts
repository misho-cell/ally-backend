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
import { countDueTasks, getDueTasks } from '../taskStore.service';

/**
 * Misho's yes, 8 Nov: about 3,500 wakes were due at two a minute, so a goal's
 * scheduled check came days late. A tick takes ten while more than a hundred
 * wait, two otherwise; it takes and leases them in one statement, so an
 * overlapping tick can never take the same goal (9 Nov: one in five were woken twice).
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

  it('takes and leases its batch in one statement, so overlapping ticks never share a goal', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getDueTasks(10, 30);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE tasks SET next_wake_at = NOW() + make_interval(mins => $2)');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('AND plan_change_requested_at IS NULL');
    expect(sql).toContain('ORDER BY next_wake_at ASC');
    expect(params).toEqual([10, 30]);
  });

  it('is sized and leased before the first goal is worked', () => {
    const tick = ENGINE.slice(ENGINE.indexOf('async function tick()'));
    const taken = tick.indexOf(
      'getDueTasks(\n    wakesThisTick(await countDueTasks(BACKLOG_WAKES + 1)),\n    WAKE_LEASE_MINUTES,\n  );',
    );
    const worked = tick.indexOf('for (const task of due) {');
    expect(taken).toBeGreaterThan(-1);
    expect(worked).toBeGreaterThan(taken);
  });
});
