import { cardTrialDays } from '../inviteCohorts.service';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

/**
 * Misho, 14 October: no 5-day card trial at checkout. Netai is invite-only, and
 * the invitation's free days are the only free period.
 */
describe('the card trial at checkout', () => {
  it('is none when the env names no number', () => {
    expect(cardTrialDays(undefined)).toBe(0);
    expect(cardTrialDays('')).toBe(0);
  });

  it('is none for a value that is not a positive whole number', () => {
    expect(cardTrialDays('0')).toBe(0);
    expect(cardTrialDays('-3')).toBe(0);
    expect(cardTrialDays('2.5')).toBe(0);
    expect(cardTrialDays('five')).toBe(0);
  });

  it('is what the env names when it names one', () => {
    expect(cardTrialDays('5')).toBe(5);
  });
});
