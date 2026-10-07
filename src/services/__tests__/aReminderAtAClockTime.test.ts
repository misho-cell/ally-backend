import { readFileSync } from 'fs';
import { join } from 'path';
import { hoursUntilClock, parseClock } from '../wakeAtClock';

/**
 * #2179 (the tester's 44028): „remind me tomorrow at 10 in the morning" was
 * answered „I cannot remind at a set time". The clock time is counted into
 * hours on the owner's own clock.
 */
const TEN = { hour: 10, minute: 0 };

describe('a reminder at a clock time', () => {
  it('reads „10:00" and „9:30", and nothing else', () => {
    expect(parseClock('10:00')).toEqual(TEN);
    expect(parseClock('9:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('ten')).toBeNull();
    expect(parseClock(10)).toBeNull();
  });

  // Tbilisi is UTC+4 all year: 08:41 UTC is 12:41 there.
  it('counts „tomorrow at 10" in Tbilisi', () => {
    const now = new Date('2026-10-07T08:41:00Z');
    expect(hoursUntilClock(now, 'Asia/Tbilisi', TEN, 1)).toBeCloseTo(21.316, 2);
  });

  it('takes „at 10" with no day as the next 10:00', () => {
    const morning = new Date('2026-10-07T04:00:00Z'); // 08:00 in Tbilisi
    expect(hoursUntilClock(morning, 'Asia/Tbilisi', TEN, null)).toBeCloseTo(2, 5);
    const afternoon = new Date('2026-10-07T08:41:00Z'); // 12:41 in Tbilisi
    expect(hoursUntilClock(afternoon, 'Asia/Tbilisi', TEN, null)).toBeCloseTo(21.316, 2);
  });

  it('follows the owner’s own zone, across a clock change', () => {
    // Madrid leaves summer time on 25 Oct: 10:00 on the 26th is 09:00 UTC.
    const now = new Date('2026-10-24T09:00:00Z');
    expect(hoursUntilClock(now, 'Europe/Madrid', TEN, 2)).toBeCloseTo(48, 5);
  });

  it('is offered to the model, and never „I cannot remind at a set time"', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('you cannot remind at a set time.');
    expect(chat).toContain('const asked = (await hoursFromClock(userId, input)) ??');
  });
});
