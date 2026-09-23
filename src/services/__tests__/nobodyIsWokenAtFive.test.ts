jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { isAWakingHour, tbilisiHour, sendDueAskReminders } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

/**
 * ELEVEN REAL PEOPLE HAVE HAD AN ASK REMINDER ON A LOCK SCREEN AT NIGHT. THREE
 * AT FIVE IN THE MORNING.
 *
 * Found at 02:57 Tbilisi by following two replies the outage monitor showed
 * with no model call behind them. Both of those went to test seats — and then
 * the code said something worse than the two runs did: `sendDueAskReminders`
 * looked at NO CLOCK AT ALL, neither for the chat message nor for the push. It
 * ran whenever the sweep ran, forty-eight hours after the question.
 *
 *     reminders ever sent                          56
 *     to a non-test account                        46
 *     outside 08:00-22:00 Tbilisi                  13
 *         of those, to a REAL person               11
 *
 *     hours:  01 → 1 · 04 → 1 · 05 → 3 · 06 → 1 · 07 → 3 · 23 → 2
 *
 * The text is careful — „if you have a minute… if you do not know, tell me
 * that too and I will not trouble you again". WHEN it arrives was not.
 */
describe('the waking hours', () => {
  const at = (iso: string): Date => new Date(iso);

  it.each([
    ['05:00 Tbilisi — the worst three', '2026-09-23T01:00:00Z', false],
    ['01:00 Tbilisi', '2026-09-23T21:00:00Z', false],
    ['07:59 Tbilisi — still too early', '2026-09-23T03:59:00Z', false],
    ['08:00 Tbilisi — the first minute it may', '2026-09-23T04:00:00Z', true],
    ['midday', '2026-09-23T08:00:00Z', true],
    ['21:59 Tbilisi — the last minute it may', '2026-09-23T17:59:00Z', true],
    ['22:00 Tbilisi — the door shuts', '2026-09-23T18:00:00Z', false],
    ['23:00 Tbilisi — two went out at this hour', '2026-09-23T19:00:00Z', false],
  ])('%s', (_name, iso, waking) => {
    expect(isAWakingHour(at(iso))).toBe(waking);
  });

  /** Tbilisi has not observed daylight saving since 2005, so this is exact. */
  it('reads Tbilisi and not the server’s own clock', () => {
    expect(tbilisiHour(at('2026-09-23T01:00:00Z'))).toBe(5);
    expect(tbilisiHour(at('2026-01-15T01:00:00Z'))).toBe(5);
  });
});

/**
 * IT DEFERS, IT DOES NOT DROP — the property that made this safe to ship
 * without waiting for a ruling on the exact hours.
 *
 * The claim and the send are ONE statement: `UPDATE … SET reminded_at = NOW()
 * … RETURNING`. So at a quiet hour the rows are simply not claimed, and the
 * next sweep inside the window finds them exactly as they were. Nobody loses a
 * reminder; a few arrive in the morning instead of at five.
 */
describe('at a quiet hour', () => {
  it('claims nothing, which is why nothing is lost', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T01:00:00Z'));

    expect(await sendDueAskReminders(10)).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('runs normally in the morning', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T08:00:00Z'));

    await sendDueAskReminders(10);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('UPDATE task_asks SET reminded_at = NOW()');

    jest.useRealTimers();
  });

  /**
   * THE CLAIM AND THE SEND MUST STAY ONE STATEMENT. If somebody ever splits
   * them — claim in one query, send in a loop afterwards — the deferral turns
   * into a drop, because the rows would be marked reminded at an hour when
   * nothing was sent.
   */
  it('marks reminded_at in the same statement that selects them', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const at = asks.indexOf('export async function sendDueAskReminders');
    const fn = asks.slice(at, at + 1400);

    expect(fn).toContain('UPDATE task_asks SET reminded_at = NOW()');
    expect(fn).toContain('RETURNING ask_thread_id, to_user_id');
  });
});

/** And the window is two named constants, so a ruling is a one-line change. */
describe('the window is somebody else’s to set', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('names the hours rather than burying them', () => {
    expect(asks).toContain('const REMINDER_QUIET_BEFORE_HOUR = 8;');
    expect(asks).toContain('const REMINDER_QUIET_AFTER_HOUR = 22;');
  });

  /**
   * AND THE ASSUMPTION IS WRITTEN DOWN. Almost every user is +995, but „almost"
   * is not „every", and a person in another zone now gets their reminder at
   * Tbilisi's daytime rather than their own. A smaller wrong than five in the
   * morning, and still a wrong.
   */
  it('says whose clock it is using, and that it is a question', () => {
    const at = asks.indexOf('ELEVEN REAL PEOPLE');
    const comment = asks.slice(at, at + 3000);

    expect(comment).toContain('NOT MINE TO SETTLE');
    expect(comment).toContain('which hours, and on whose clock');
  });
});
