jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { renderWeeklySummary } from '../weeklySummary.service';

/** 1693 (A9): one line when N > 0 — „you helped N members this month"; nothing else, no ranking. */
describe('the weekly summary’s helped line', () => {
  it('says the number when there is one', () => {
    expect(renderWeeklySummary([], 0, 0, '2026-10-05', 2)).toContain('ამ თვეში 2 წევრს დაეხმარე.');
  });

  it('says nothing at zero', () => {
    expect(renderWeeklySummary([], 0, 0, '2026-10-05', 0)).not.toContain('დაეხმარე');
    expect(renderWeeklySummary([], 0, 0, '2026-10-05')).not.toContain('დაეხმარე');
  });
});
