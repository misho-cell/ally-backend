import { clampReminderMinutes, MAX_REMINDER_MINUTES } from '../ownerReminders.service';
import { hoursUntilClock, MAX_DAY_OFFSET, MAX_REMINDER_DAY_OFFSET } from '../wakeAtClock';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));

const DAY_MINUTES = 24 * 60;
const NOW = new Date('2026-10-16T08:00:00Z');
const TEN = { hour: 10, minute: 0 };

/** 0306r (the tester's FAIL, 16 Oct): „remind me on 28 Oct" must come on 28 Oct. */
describe('a reminder reaches its day', () => {
  it('keeps twelve days as twelve days', () => {
    expect(clampReminderMinutes(12 * DAY_MINUTES)).toBe(12 * DAY_MINUTES);
  });

  it('stops at sixty days', () => {
    expect(MAX_REMINDER_MINUTES).toBe(60 * DAY_MINUTES);
    expect(clampReminderMinutes(90 * DAY_MINUTES)).toBe(60 * DAY_MINUTES);
  });

  it('counts a named day twelve days ahead to that day at ten', () => {
    const hours = hoursUntilClock(NOW, 'Asia/Tbilisi', TEN, 12, MAX_REMINDER_DAY_OFFSET);
    // 10:00 Tbilisi is 06:00Z: twelve days later, minus the two hours between 08:00Z and 06:00Z.
    expect(hours).toBe(12 * 24 - 2);
  });

  it('leaves a goal’s wake at its week', () => {
    const hours = hoursUntilClock(NOW, 'Asia/Tbilisi', TEN, 12);
    expect(hours).toBe(MAX_DAY_OFFSET * 24 - 2);
  });
});
