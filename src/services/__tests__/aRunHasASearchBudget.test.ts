jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SEARCH_BUDGET_SPENT, searchBudgetSpent } from '../chat.service';

/**
 * Board #959: 92 runs on 4–5 October took over a minute, at about nine model
 * rounds and eleven searches each. A run's searches are capped at eight.
 */
describe('a run’s search budget', () => {
  it('allows eight searches, then refuses the ninth', () => {
    const run = 'budget-run-1';
    const verdicts = Array.from({ length: 9 }, (_, i) =>
      searchBudgetSpent(run, i % 2 === 0 ? 'search_by_tag' : 'web_search'),
    );
    expect(verdicts.slice(0, 8).every((spent) => !spent)).toBe(true);
    expect(verdicts[8]).toBe(true);
  });

  it('leaves a lookup by name and non-search tools free', () => {
    const run = 'budget-run-2';
    for (let i = 0; i < 8; i += 1) searchBudgetSpent(run, 'search_second_degree');
    expect(searchBudgetSpent(run, 'search_contact_by_name')).toBe(false);
    expect(searchBudgetSpent(run, 'propose_task_plan')).toBe(false);
    expect(searchBudgetSpent(run, 'fetch_page')).toBe(true);
  });

  it('tells the model to answer now from what it found', () => {
    expect(SEARCH_BUDGET_SPENT).toContain('Do not search again');
    expect(SEARCH_BUDGET_SPENT).toContain('Write your answer now from what you found');
  });

  it('is checked before a tool runs and forgotten with the run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (runId !== undefined && searchBudgetSpent(runId, name)) {');
    expect(chat).toContain('runSearchCalls.delete(runId);');
  });
});
