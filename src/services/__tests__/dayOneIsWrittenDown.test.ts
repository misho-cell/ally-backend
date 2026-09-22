/**
 * Ticket 20 rows 231 and 239 — the WIRING, which a sabotage run caught me
 * leaving untested.
 *
 * The service has ten tests of its own and every one passed with the call to
 * `recordWake` deleted from `startDayOne`, because nothing held the two
 * together. That is the second time today the same hole has appeared: a guard
 * whose input is chosen by untested code is a guard with an untested half.
 *
 * What is held here is small and exact: day one writes its row before the
 * timer, closes it on the ways out, and the sweeper only ever dispatches a
 * kind it knows.
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn().mockResolvedValue({ rows: [] }),
  __esModule: true,
}));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../engineWakes.service', () => ({
  __esModule: true,
  DAY_ONE_WAKE: 'day_one',
  recordWake: jest.fn().mockResolvedValue(undefined),
  finishWake: jest.fn().mockResolvedValue(undefined),
  wakeDoneSince: jest.fn().mockResolvedValue(false),
  claimOverdueWakes: jest.fn().mockResolvedValue([]),
  abandonExhaustedWakes: jest.fn().mockResolvedValue(0),
}));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn().mockResolvedValue(null),
  ensureNextWake: jest.fn().mockResolvedValue(true),
}));

import { finishWake, recordWake, wakeDoneSince } from '../engineWakes.service';
import { getTaskById } from '../taskStore.service';
import { startDayOne } from '../taskEngine.service';

const mockRecord = recordWake as jest.MockedFunction<typeof recordWake>;
const mockFinish = finishWake as jest.MockedFunction<typeof finishWake>;
const mockDoneSince = wakeDoneSince as jest.MockedFunction<typeof wakeDoneSince>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;

beforeEach(() => {
  jest.clearAllMocks();
  mockDoneSince.mockResolvedValue(false);
  mockTask.mockResolvedValue(null);
});

describe('day one is written down before it is timed', () => {
  it('records the wake, with the delay it will actually wait', () => {
    startDayOne(6865);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toBe(6865);
    expect(mockRecord.mock.calls[0][1]).toBe('day_one');
    // Three seconds is the delay the engine uses; the row's due time has to
    // agree with it or the sweeper's two-minute grace measures the wrong thing.
    expect(mockRecord.mock.calls[0][2]).toBe(3_000);
  });

  /**
   * The sweeper re-runs a lost wake with no delay — it is already late. If
   * this argument stopped being passed through, a swept wake would wait its
   * three seconds again, which is harmless, and record a due time three
   * seconds in the future, which is not: the row would look not-yet-due.
   */
  it('passes the sweeper’s zero delay through to the row', () => {
    startDayOne(6865, 0);

    expect(mockRecord.mock.calls[0][2]).toBe(0);
  });

  it('records before anything can be lost, not after the timer fires', () => {
    // Synchronous: the call has happened by the time startDayOne returns, so a
    // process that dies during the delay has already left the row behind.
    startDayOne(7000);

    expect(mockRecord).toHaveBeenCalled();
  });
});

/**
 * AND IT ASKS WHETHER SOMEBODY ELSE ALREADY RAN IT — the half the atomic claim
 * cannot do, wired here rather than only tested in the service.
 *
 * The timer and the sweeper can both be queued for one wake. `claimOverdueWakes`
 * stops two SWEEPERS colliding, but the timer claims nothing — it does not
 * touch the table until it has finished — and the two-minute grace before a
 * claim covers the timer's ninety seconds of trying to get INTO the thread, not
 * the sixty-to-ninety-second run that follows it:
 *
 *   due+60   the thread frees and the timer's run begins
 *   due+120  the sweeper claims the row; `done_at` is still NULL
 *   due+150  the timer's run ends and closes the row
 *   due+156  the sweeper's next retry finds an open goal and a free thread
 *
 * Goal 7790 this morning was claimed at 09:00:12 and closed at 09:00:42 — that
 * one was the net working, because the timer had already given up. Nothing in
 * the guard could have told the two cases apart.
 */
describe('day one stands down when somebody else has already run it', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not even look at the goal, let alone wake it', async () => {
    mockDoneSince.mockResolvedValue(true);

    startDayOne(6865, 0);
    await jest.advanceTimersByTimeAsync(1);

    expect(mockDoneSince).toHaveBeenCalledWith(6865, 'day_one', expect.any(Date));
    expect(mockTask).not.toHaveBeenCalled();
    // Nothing to close: whoever ran it closed the row on their way out.
    expect(mockFinish).not.toHaveBeenCalled();
  });

  /**
   * The other side of the same wire. Without this, „never wakes" would pass the
   * test above just as well as „stands down correctly" does.
   */
  it('carries straight on to the goal when nobody has', async () => {
    mockDoneSince.mockResolvedValue(false);

    startDayOne(6865, 0);
    await jest.advanceTimersByTimeAsync(1);

    expect(mockTask).toHaveBeenCalledWith(6865);
    // The goal is gone here, so the row is closed — the behaviour that stops
    // the sweeper picking one dead goal up five times, and it must survive.
    expect(mockFinish).toHaveBeenCalledWith(6865, 'day_one');
  });

  /**
   * THE QUEUE TIME, NOT THE FIRE TIME, and the difference is the whole guard.
   *
   * Compared against the moment the wake fires, the timer's own `finishWake`
   * would always look like somebody else's — it lands after that moment — and
   * every retry would stand down. Compared against the moment this caller was
   * QUEUED, a later close can only belong to another runner.
   */
  it('compares against the moment it was queued, not the moment it fires', async () => {
    jest.setSystemTime(new Date('2026-09-22T09:00:00.000Z'));

    startDayOne(6865, 3_000);
    await jest.advanceTimersByTimeAsync(3_000);

    expect(mockDoneSince.mock.calls[0][2]).toEqual(new Date('2026-09-22T09:00:00.000Z'));
  });
});
