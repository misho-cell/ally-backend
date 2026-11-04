jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { IdleWake, idleDecision } from '../idleWakes.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (days: number): Date => new Date(NOW.getTime() - days * DAY);

/** #8625, Tornike's rule: raised at 1 day, again at 4, asked once at 7, then quiet. */
describe('an idle goal is reminded at 1 and 4 days, asked at 7, then quiet (#8625)', () => {
  it('wakes as before while a person wrote within a day', () => {
    expect(idleDecision({ lastHumanAt: ago(0.5), reminders: 0, remindedAt: null }, NOW).kind).toBe(
      IdleWake.Normal,
    );
  });

  it('gives the first reminder at one day, the next due at four', () => {
    const d = idleDecision({ lastHumanAt: ago(1.5), reminders: 0, remindedAt: null }, NOW);
    expect(d.kind).toBe(IdleWake.Reminder);
    expect(d.at?.getTime()).toBe(ago(1.5).getTime() + 4 * DAY);
  });

  it('holds the wake until four days after the first reminder', () => {
    const d = idleDecision({ lastHumanAt: ago(2), reminders: 1, remindedAt: ago(1) }, NOW);
    expect(d.kind).toBe(IdleWake.NotYet);
    expect(d.at?.getTime()).toBe(ago(2).getTime() + 4 * DAY);
  });

  it('gives the second reminder at four days, the question due at seven', () => {
    const d = idleDecision({ lastHumanAt: ago(4.5), reminders: 1, remindedAt: ago(3.5) }, NOW);
    expect(d.kind).toBe(IdleWake.Reminder);
    expect(d.at?.getTime()).toBe(ago(4.5).getTime() + 7 * DAY);
  });

  it('asks once whether to keep, change or close at seven days', () => {
    expect(
      idleDecision({ lastHumanAt: ago(7.5), reminders: 2, remindedAt: ago(3) }, NOW).kind,
    ).toBe(IdleWake.CloseQuestion);
  });

  it('stays quiet after the question', () => {
    const d = idleDecision({ lastHumanAt: ago(9), reminders: 3, remindedAt: ago(2) }, NOW);
    expect(d.kind).toBe(IdleWake.NotYet);
    expect(d.at?.getTime()).toBe(ago(2).getTime() + 30 * DAY);
  });

  it('starts the count again when a person has written since the last reminder', () => {
    const d = idleDecision({ lastHumanAt: ago(1.2), reminders: 3, remindedAt: ago(3) }, NOW);
    expect(d.kind).toBe(IdleWake.Reminder);
  });
});
