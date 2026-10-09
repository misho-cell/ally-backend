jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { sendDueAskReminders } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});
afterEach(() => jest.useRealTimers());

/**
 * Nobody is woken at five — and since 2 October that is the PUSH's job, not
 * the reminder's (G-002; Misho retired D472's 08:00–22:00 Tbilisi gate).
 *
 * Eleven real people once had an ask reminder on a lock screen at night,
 * three at five in the morning, because the reminder rang the phone the moment
 * it was written. Push quiet hours now hold the ringing (23:00–09:30 on each
 * device's own clock, pushWaitsForTheMorning.test.ts), so the reminder itself
 * lands in the app at any hour, like every other message.
 */
describe('a reminder at night', () => {
  it('is claimed and written at 05:00 Tbilisi — its push is what waits', async () => {
    jest.useFakeTimers({
      now: new Date('2026-09-23T01:00:00Z'),
      doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask'],
    });

    await sendDueAskReminders(10);

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('UPDATE task_asks SET reminded_at = NOW()');
  });

  /**
   * THE CLAIM AND THE SEND STAY ONE STATEMENT. Split them — claim in one
   * query, send in a loop afterwards — and a failure between the two marks a
   * person reminded who was never sent anything.
   */
  it('marks reminded_at in the same statement that selects them', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const at = asks.indexOf('export async function sendDueAskReminders');
    const fn = asks.slice(at, at + 1900);

    expect(fn).toContain('UPDATE task_asks SET reminded_at = NOW()');
    expect(fn).toContain('RETURNING ask_thread_id, to_user_id');
  });

  it('keeps no clock of its own any more', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).not.toContain('isAWakingHour');
    expect(asks).not.toContain('REMINDER_QUIET_BEFORE_HOUR');
  });
});
