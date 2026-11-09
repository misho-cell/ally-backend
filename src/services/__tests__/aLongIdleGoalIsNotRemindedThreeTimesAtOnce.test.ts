import { IdleWake, idleDecision } from '../idleWakes.service';

/**
 * Misho's queue check, 9 Nov: a goal idle since 21 Oct was woken three times in
 * seven minutes — first reminder, second reminder, close question — because each
 * next step was counted from the owner's last line and was already past. A step
 * that is already past now comes a day from now.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-09T08:27:00Z');
const LONG_AGO = new Date(NOW.getTime() - 19 * DAY);

describe('a goal idle for weeks', () => {
  it('after its first reminder, waits a day for the next', () => {
    const first = idleDecision({ lastHumanAt: LONG_AGO, reminders: 0, remindedAt: null }, NOW);
    expect(first.kind).toBe(IdleWake.Reminder);
    expect(first.at?.getTime()).toBe(NOW.getTime() + DAY);
  });

  it('after its second reminder, waits a day for the close question', () => {
    const second = idleDecision({ lastHumanAt: LONG_AGO, reminders: 1, remindedAt: NOW }, NOW);
    expect(second.kind).toBe(IdleWake.Reminder);
    expect(second.at?.getTime()).toBe(NOW.getTime() + DAY);
  });

  it('a goal on the usual schedule keeps it', () => {
    const lastHuman = new Date(NOW.getTime() - 1.5 * DAY);
    const first = idleDecision({ lastHumanAt: lastHuman, reminders: 0, remindedAt: null }, NOW);
    expect(first.at?.getTime()).toBe(lastHuman.getTime() + 4 * DAY);
  });
});
