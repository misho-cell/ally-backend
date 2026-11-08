import { readFileSync } from 'fs';
import { join } from 'path';

const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { rememberWaysFound, waysFoundBefore, withEarlierWays } from '../waysFound';

/**
 * Misho's yes, 8 Nov (ops' daily check, item 2): a day-one run tried to add two
 * go-betweens its goal had found the day before, and the plan was refused — the
 * guard remembered only the current run. Ways found are now kept per
 * conversation for 30 days.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('ways found in an earlier run', () => {
  beforeEach(() => mockQuery.mockReset());

  it('are kept per conversation, as digits, once each', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 2 });
    await rememberWaysFound(7, ['+995 555 12-34-56', '995555123456', '+995 577 000 111']);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO thread_ways_found');
    expect(sql).toContain('ON CONFLICT (thread_id, phone_digits) DO UPDATE SET found_at = NOW()');
    expect(params).toEqual([7, ['995555123456', '995577000111']]);
  });

  it('write nothing when nothing was found', async () => {
    await rememberWaysFound(7, ['', 'no digits']);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('are read back for 30 days, and a failed read only means less is known', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ phone_digits: '995555123456' }] });
    await expect(waysFoundBefore(7)).resolves.toEqual(new Set(['995555123456']));
    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1]).toEqual([7, 30, 500]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(waysFoundBefore(7)).resolves.toEqual(new Set());
    warn.mockRestore();
  });

  it('widen what a searching run may name, and never check a run that searched nothing', () => {
    const earlier = new Set(['1']);
    expect(withEarlierWays(new Set(['2']), earlier)).toEqual(new Set(['1', '2']));
    expect(withEarlierWays(undefined, earlier)).toBeUndefined();
    expect(withEarlierWays(new Set(), earlier)).toEqual(new Set());
  });

  it('are what the plan guard reads, and every search keeps its ways', () => {
    expect(CHAT).toContain(
      'withEarlierWays(runWayInPhones.get(runId), await waysFoundBefore(threadId)),',
    );
    expect(CHAT).toContain('if (threadId !== undefined) void rememberWaysFound(threadId, ways);');
  });
});
