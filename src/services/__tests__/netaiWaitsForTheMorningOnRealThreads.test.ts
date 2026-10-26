jest.unmock('../quietWakeGuard');
const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { WakeOrigin, goalWaitsForMorning, wakeWaitsForMorning } from '../quietWakeGuard';

/** 00:04 UTC is 04:04 Tbilisi: tester 76165, real owner's goals woken on helpers' answers. */
const NIGHT = new Date('2026-10-26T00:04:00Z');
const NOON = new Date('2026-10-26T08:00:00Z');
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

beforeEach(() => jest.resetAllMocks());

describe('#7234: a run Netai starts on its own waits for the morning', () => {
  it('holds a real owner at night and reads nothing by day', async () => {
    mockQuery.mockResolvedValue({ rows: [{ found: false }] });
    expect(await wakeWaitsForMorning('598', WakeOrigin.Netai, NIGHT)).toBe(true);
    expect(await wakeWaitsForMorning('598', WakeOrigin.Netai, NOON)).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain('FROM test_seats WHERE user_id = $1::int');
    expect(params).toEqual(['598']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('never holds what the owner caused, nor a test seat', async () => {
    expect(await wakeWaitsForMorning('598', WakeOrigin.Owner, NIGHT)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockResolvedValue({ rows: [{ found: true }] });
    expect(await wakeWaitsForMorning('9001', WakeOrigin.Netai, NIGHT)).toBe(false);
  });

  it('asks by goal for the answer paths', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 598 }] })
      .mockResolvedValueOnce({ rows: [{ found: false }] });
    expect(await goalWaitsForMorning(42, NIGHT)).toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual([42]);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await goalWaitsForMorning(43, NIGHT)).toBe(false);
    expect(await goalWaitsForMorning(42, NOON)).toBe(false);
  });

  it('sits on the wake itself, and the owner-caused wakes say so', () => {
    expect(engine).toContain("if (await wakeWaitsForMorning(ownerId, origin)) return 'quiet';");
    expect(engine).toContain('origin: WakeOrigin = WakeOrigin.Netai,');
    for (const file of ['goalQuestions.service.ts', 'netaiReplyWake.service.ts']) {
      expect(readFileSync(join(__dirname, '..', file), 'utf8')).toContain('WakeOrigin.Owner');
    }
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain('WakeOrigin.Owner,');
  });

  it('keeps night answers owed, and the sweeps stamp nothing at night', () => {
    expect(engine).toContain('if (await goalWaitsForMorning(taskId)) return 0;');
    expect(engine.match(/if \(await goalWaitsForMorning\(task\.id\)\) continue;/gu)).toHaveLength(
      4,
    );
    expect(engine).toContain('if (await goalWaitsForMorning(ask.task_id)) continue;');
    expect(engine).toContain("if (woken === 'quiet') {");
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('if (await goalWaitsForMorning(captured.taskId)) return;');
  });
});
