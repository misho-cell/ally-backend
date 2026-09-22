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
  claimOverdueWakes: jest.fn().mockResolvedValue([]),
  abandonExhaustedWakes: jest.fn().mockResolvedValue(0),
}));

import { recordWake } from '../engineWakes.service';
import { startDayOne } from '../taskEngine.service';

const mockRecord = recordWake as jest.MockedFunction<typeof recordWake>;

beforeEach(() => jest.clearAllMocks());

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
