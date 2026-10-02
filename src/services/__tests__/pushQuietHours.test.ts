import {
  DEFAULT_PUSH_TIME_ZONE,
  isQuietHour,
  nextQuietEnd,
  pushTimeZone,
  validTimeZone,
} from '../pushQuietHours';

/**
 * Giorgi's decision, 2 October (G-002, team task 200): no push between 23:00
 * and 09:30 in the recipient's own local time; held pushes go at 09:30 theirs.
 * Tbilisi is UTC+4 all year.
 */
const TBILISI = 'Asia/Tbilisi';
const NEW_YORK = 'America/New_York';

describe('which minutes are quiet', () => {
  it('22:50 local goes at once', () => {
    expect(isQuietHour(new Date('2026-10-02T18:50:00Z'), TBILISI)).toBe(false);
  });

  it('23:00 and 23:30 local are quiet', () => {
    expect(isQuietHour(new Date('2026-10-02T19:00:00Z'), TBILISI)).toBe(true);
    expect(isQuietHour(new Date('2026-10-02T19:30:00Z'), TBILISI)).toBe(true);
  });

  it('09:29 is still quiet and 09:30 is not', () => {
    expect(isQuietHour(new Date('2026-10-03T05:29:00Z'), TBILISI)).toBe(true);
    expect(isQuietHour(new Date('2026-10-03T05:30:00Z'), TBILISI)).toBe(false);
  });

  it('is read on the device’s own clock: one instant, two answers', () => {
    // 20:00 UTC = 00:00 Tbilisi (quiet) = 16:00 New York (not).
    const at = new Date('2026-10-02T20:00:00Z');
    expect(isQuietHour(at, TBILISI)).toBe(true);
    expect(isQuietHour(at, NEW_YORK)).toBe(false);
  });
});

describe('when a held push goes out', () => {
  it('a push at 23:30 local waits for 09:30 the next morning', () => {
    expect(nextQuietEnd(new Date('2026-10-02T19:30:00Z'), TBILISI).toISOString()).toBe(
      '2026-10-03T05:30:00.000Z',
    );
  });

  it('a push at 03:00 local waits for 09:30 the same morning', () => {
    expect(nextQuietEnd(new Date('2026-10-02T23:00:00Z'), TBILISI).toISOString()).toBe(
      '2026-10-03T05:30:00.000Z',
    );
  });

  it('two recipients in different zones each get it at their own 09:30', () => {
    // 04:00 UTC: 08:00 Tbilisi, 00:00 New York (EDT, UTC-4) — both quiet.
    const at = new Date('2026-10-03T04:00:00Z');
    expect(nextQuietEnd(at, TBILISI).toISOString()).toBe('2026-10-03T05:30:00.000Z');
    expect(nextQuietEnd(at, NEW_YORK).toISOString()).toBe('2026-10-03T13:30:00.000Z');
  });

  it('lands on 09:30 local across a clock change', () => {
    // New York leaves daylight time on 1 Nov 2026: 09:30 EST is 14:30 UTC.
    const at = new Date('2026-11-01T05:00:00Z'); // 01:00 EDT, before the change
    expect(nextQuietEnd(at, NEW_YORK).toISOString()).toBe('2026-11-01T14:30:00.000Z');
  });
});

describe('which zone a device is held by', () => {
  it('its own when the runtime knows it', () => {
    expect(validTimeZone(' Europe/Berlin ')).toBe('Europe/Berlin');
    expect(pushTimeZone('Europe/Berlin')).toBe('Europe/Berlin');
  });

  it('Tbilisi when it has not said, or said something unknown', () => {
    expect(validTimeZone('Mars/Olympus')).toBeNull();
    expect(validTimeZone(42)).toBeNull();
    expect(pushTimeZone(null)).toBe(DEFAULT_PUSH_TIME_ZONE);
    expect(pushTimeZone('Mars/Olympus')).toBe(DEFAULT_PUSH_TIME_ZONE);
  });
});
