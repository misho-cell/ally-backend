import { budgetWindow, PERIOD_KEY_PARAM } from '../budgetWindow';

// D124: the env decides WHICH fragment is used, never what it says.
describe('budgetWindow', () => {
  afterEach(() => {
    delete process.env.BUDGET_WINDOW;
  });

  it('is the calendar month unless told otherwise', () => {
    delete process.env.BUDGET_WINDOW;
    expect(budgetWindow().unit).toBe('month');
    process.env.BUDGET_WINDOW = 'fortnight';
    expect(budgetWindow().unit).toBe('month');
    process.env.BUDGET_WINDOW = '';
    expect(budgetWindow().label).toBe('calendar_month');
  });

  it('switches to the ISO week on BUDGET_WINDOW=week, case-insensitively', () => {
    process.env.BUDGET_WINDOW = ' Week ';
    const w = budgetWindow();
    expect(w.unit).toBe('week');
    expect(w.keyPrefix).toBe('w:');
    expect(w.grantPriceKey).toBe('tokens.weekly_grant');
    expect(w.label).toBe('calendar_week');
  });

  it('keeps the two key families apart so they never compare across the switch', () => {
    const month = budgetWindow();
    process.env.BUDGET_WINDOW = 'week';
    const week = budgetWindow();
    expect(month.keyPrefix).not.toBe(week.keyPrefix);
    expect(month.currentKeySql.startsWith(`'${month.keyPrefix}'`)).toBe(true);
    expect(week.currentKeySql.startsWith(`'${week.keyPrefix}'`)).toBe(true);
    // A past period's fragments read the key from one fixed placeholder.
    expect(month.periodStartSql).toContain(PERIOD_KEY_PARAM);
    expect(week.periodEndSql).toContain(PERIOD_KEY_PARAM);
  });
});
