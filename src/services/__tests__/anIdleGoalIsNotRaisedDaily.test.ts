jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { IdleWake, idleDecision } from '../idleWakes.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (days: number): Date => new Date(NOW.getTime() - days * DAY);

/** #8625: waiting items were re-raised at every daily wake. */
describe('an idle goal is reminded at 2 days, asked at 5, then quiet (#8625)', () => {
  it('wakes as before while a person wrote within two days', () => {
    expect(idleDecision({ lastHumanAt: ago(1), reminders: 0, remindedAt: null }, NOW).kind).toBe(
      IdleWake.Normal,
    );
  });

  it('gives one reminder at two days, the next due at five', () => {
    const d = idleDecision({ lastHumanAt: ago(2.5), reminders: 0, remindedAt: null }, NOW);
    expect(d.kind).toBe(IdleWake.Reminder);
    expect(d.at?.getTime()).toBe(ago(2.5).getTime() + 5 * DAY);
  });

  it('holds the wake until five days after one reminder', () => {
    const d = idleDecision({ lastHumanAt: ago(3), reminders: 1, remindedAt: ago(1) }, NOW);
    expect(d.kind).toBe(IdleWake.NotYet);
  });

  it('asks once whether to close at five days', () => {
    expect(idleDecision({ lastHumanAt: ago(6), reminders: 1, remindedAt: ago(4) }, NOW).kind).toBe(
      IdleWake.CloseQuestion,
    );
  });

  it('stays quiet for thirty days after the close question', () => {
    const d = idleDecision({ lastHumanAt: ago(8), reminders: 2, remindedAt: ago(2) }, NOW);
    expect(d.kind).toBe(IdleWake.NotYet);
    expect(d.at?.getTime()).toBe(ago(2).getTime() + 30 * DAY);
  });

  it('starts the count again when a person has written since the last reminder', () => {
    const d = idleDecision({ lastHumanAt: ago(2.2), reminders: 2, remindedAt: ago(3) }, NOW);
    expect(d.kind).toBe(IdleWake.Reminder);
  });
});
