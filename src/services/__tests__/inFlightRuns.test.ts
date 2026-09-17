import {
  beginRun,
  drain,
  endRun,
  inFlightCount,
  isDraining,
  resetDrainState,
} from '../inFlightRuns';

beforeEach(() => resetDrainState());

/**
 * Ticket 20 row 205 — a deploy must not cut a run in half.
 *
 * Measured 17 September: the container's last log line on every deploy is
 * `npm error signal SIGTERM`. Nothing handled it, so the process died where it
 * stood and every run inside it died with it. Of six fresh goals that morning,
 * four lost a run and three sat against a deploy window.
 */
describe('counting what a shutdown is about to cut off', () => {
  it('counts runs in and out', () => {
    beginRun('a');
    beginRun('b');
    expect(inFlightCount()).toBe(2);

    endRun('a');
    expect(inFlightCount()).toBe(1);
  });

  it('ending a run twice is not a negative count', () => {
    beginRun('a');
    endRun('a');
    endRun('a');

    expect(inFlightCount()).toBe(0);
  });
});

describe('draining', () => {
  it('is not draining until it is', () => {
    expect(isDraining()).toBe(false);
  });

  it('refuses new work the moment a shutdown starts', async () => {
    // The part that was purely self-inflicted: a run STARTED inside a
    // container already on its way out never had a chance, and its owner was
    // still told „please try again".
    const waiting = drain(300);
    expect(isDraining()).toBe(true);
    await waiting;
  });

  it('returns 0 when everything finished in time', async () => {
    beginRun('a');
    setTimeout(() => endRun('a'), 50);

    expect(await drain(2_000)).toBe(0);
  });

  it('returns what it could NOT wait for, rather than exiting as if clean', async () => {
    // A run takes 60-90 seconds and the platform's grace is a few, so this
    // cannot save one halfway through. Reporting zero here would make a lost
    // answer look like a clean shutdown.
    beginRun('a');
    beginRun('b');

    expect(await drain(300)).toBe(2);
  });

  it('does not wait at all when nothing is running', async () => {
    const started = Date.now();
    await drain(5_000);

    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
