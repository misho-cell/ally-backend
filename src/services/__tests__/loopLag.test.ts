import { resetLagWatch, startLoopLagWatch, stopLoopLagWatch, worstLagMs } from '../loopLag';

afterEach(() => {
  stopLoopLagWatch();
  resetLagWatch();
  jest.useRealTimers();
});

/**
 * Ticket 20 row 202, fourth pass — is the API going quiet, or are we too busy
 * to listen?
 *
 * Two goals that ANSWERED, so nothing looked broken: 159 events then 43.3 s of
 * silence, 120 events then 57.8 s. In both the stream delivered and then
 * stopped dead. That has exactly two explanations — the API paused, or our own
 * process was blocked and the bytes sat unread — and they are indistinguishable
 * in every measurement taken so far while needing opposite fixes.
 *
 * A timer asked to fire every second cannot be late unless the loop was busy,
 * so its lateness IS the blockage, in milliseconds.
 */
describe('the event-loop lag probe', () => {
  it('says nothing on a healthy loop', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.useFakeTimers();
    startLoopLagWatch();

    // Time advances exactly as the timer expects: no lateness at all.
    jest.advanceTimersByTime(5_000);

    expect(warn).not.toHaveBeenCalled();
    expect(worstLagMs()).toBe(0);
    warn.mockRestore();
  });

  it('reports the lateness when the loop was held', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.useFakeTimers().setSystemTime(new Date('2026-09-17T12:00:00Z'));
    startLoopLagWatch();

    // The clock jumps ten seconds while only one tick is delivered — which is
    // what a blocked loop looks like from inside it.
    jest.setSystemTime(new Date('2026-09-17T12:00:11Z'));
    jest.advanceTimersByTime(1_000);

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('event loop blocked');
    expect(worstLagMs()).toBeGreaterThan(9_000);
    warn.mockRestore();
  });

  it('starting twice does not start two probes measuring each other', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.useFakeTimers().setSystemTime(new Date('2026-09-17T12:00:00Z'));
    startLoopLagWatch();
    startLoopLagWatch();

    jest.setSystemTime(new Date('2026-09-17T12:00:11Z'));
    jest.advanceTimersByTime(1_000);

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('keeps the worst reading until it is read and reset', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.useFakeTimers().setSystemTime(new Date('2026-09-17T12:00:00Z'));
    startLoopLagWatch();

    jest.setSystemTime(new Date('2026-09-17T12:00:11Z'));
    jest.advanceTimersByTime(1_000);
    const worst = worstLagMs();

    // A later, smaller block must not overwrite the worst one seen.
    jest.setSystemTime(new Date('2026-09-17T12:00:15Z'));
    jest.advanceTimersByTime(1_000);

    expect(worstLagMs()).toBe(worst);
    resetLagWatch();
    expect(worstLagMs()).toBe(0);
    warn.mockRestore();
  });
});
