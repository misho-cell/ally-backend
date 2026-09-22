/**
 * TWO NUMBERS THAT MUST MOVE TOGETHER, AND A THIRD THAT DECIDES THE PROMISE.
 *
 * The sweep tick went from 60 s to 20 s on 22 September so that a lost first
 * day is recovered inside the seat's done-when. The throttle went from 5 to 2
 * in the SAME change, because leaving it at 5 would have taken the ceiling
 * from 5 goals a minute to 15 — a tripling of a deliberate safety limit
 * arriving as the side effect of a latency fix.
 *
 * The comment it protects is load-bearing and was written by somebody who
 * meant it: „a tick that sweeps up fifty goals at once is a tick that writes to
 * fifty people's contacts at once."
 *
 * So the ceiling is asserted, not the constants. Anybody may retune either
 * number; nobody may quietly raise how many people get written to in a minute.
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { PER_TICK, TICK_INTERVAL_MS } from '../engineWakes.cron';
import { OVERDUE_AFTER_SECONDS_FOR_TEST } from '../engineWakes.service';

const goalsPerMinute = (): number => PER_TICK * (60_000 / TICK_INTERVAL_MS);

describe('the sweep cannot quietly start writing to more people', () => {
  /**
   * Six a minute against the old five. Named exactly, because „unchanged"
   * would be the comfortable word and it is not the true one.
   */
  it('holds the ceiling at six goals a minute', () => {
    expect(goalsPerMinute()).toBe(6);
  });

  it('fails if the tick speeds up without the throttle coming down', () => {
    // The shape of the mistake this exists to catch: tick 20s, PER_TICK still 5.
    const wouldHaveBeen = 5 * (60_000 / 20_000);

    expect(wouldHaveBeen).toBe(15);
    expect(goalsPerMinute()).toBeLessThan(wouldHaveBeen);
  });
});

/**
 * AND THE PROMISE THE TICK WAS CHANGED FOR. „Day one is already starting behind
 * your reply" promises a START, so the done-when is measured to the start:
 * three seconds of delay, the grace before a claim, and at worst a whole tick.
 */
describe('a lost first day starts again inside three minutes', () => {
  const DAY_ONE_DELAY_SECONDS = 3;

  it('worst case is under three minutes, to the START', () => {
    const worst = DAY_ONE_DELAY_SECONDS + OVERDUE_AFTER_SECONDS_FOR_TEST + TICK_INTERVAL_MS / 1000;

    expect(worst).toBe(143);
    expect(worst).toBeLessThan(180);
  });

  /**
   * Sixty seconds of tick put the worst case at 183 — three seconds over — and
   * that is before the run itself. The margin is the reason the tick moved.
   */
  it('and the old sixty-second tick did not fit', () => {
    expect(DAY_ONE_DELAY_SECONDS + OVERDUE_AFTER_SECONDS_FOR_TEST + 60).toBeGreaterThan(180);
  });
});
