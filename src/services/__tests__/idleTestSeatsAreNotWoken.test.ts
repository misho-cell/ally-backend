const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
}));

import {
  TEST_SEAT_DAILY_BUDGET_USD,
  TEST_SEAT_IDLE_HOURS,
  forgetBudgetReading,
  holdTestSeatWakes,
  testSeatWakeHeld,
  testSeatsOverBudget,
} from '../testSeatWakes';

/**
 * Misho, 10 Nov: about $320 a day went on scheduled checks of test seats'
 * goals nobody was testing. Those wait a day; past the day's budget all do.
 */
describe('test seats’ scheduled checks', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    forgetBudgetReading();
  });

  it('holds only test seats’ due goals, by a typed message within the day unless over budget', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 7, rows: [] });
    await expect(holdTestSeatWakes(false)).resolves.toBe(7);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM test_seats');
    expect(sql).toContain('next_wake_at <= NOW()');
    expect(sql).toContain("c.kind = 'message'");
    expect(params).toEqual([TEST_SEAT_IDLE_HOURS, false]);
  });

  it('is over budget at the day’s limit and not below it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ usd: String(TEST_SEAT_DAILY_BUDGET_USD) }] });
    await expect(testSeatsOverBudget(0)).resolves.toBe(true);
    forgetBudgetReading();
    mockQuery.mockResolvedValueOnce({ rows: [{ usd: null }] });
    await expect(testSeatsOverBudget(0)).resolves.toBe(false);
  });

  it('reads the spend at most every five minutes', async () => {
    mockQuery.mockResolvedValue({ rows: [{ usd: '1' }] });
    await testSeatsOverBudget(0);
    await testSeatsOverBudget(60_000);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    await testSeatsOverBudget(6 * 60_000);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('a run the server starts on its own for a test seat', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    forgetBudgetReading();
  });

  it('is never held for a real owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ seat: false, recent: false }] });
    await expect(testSeatWakeHeld('1', 2)).resolves.toBe(false);
  });

  it('is held when nobody typed in the conversation within the day', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ seat: true, recent: false }] });
    await expect(testSeatWakeHeld('1', 2)).resolves.toBe(true);
  });

  it('runs while a tester is testing, until the day’s budget is spent', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ seat: true, recent: true }] })
      .mockResolvedValueOnce({ rows: [{ usd: '1' }] });
    await expect(testSeatWakeHeld('1', 2)).resolves.toBe(false);
    forgetBudgetReading();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ seat: true, recent: true }] })
      .mockResolvedValueOnce({ rows: [{ usd: String(TEST_SEAT_DAILY_BUDGET_USD + 1) }] });
    await expect(testSeatWakeHeld('1', 2)).resolves.toBe(true);
  });
});
