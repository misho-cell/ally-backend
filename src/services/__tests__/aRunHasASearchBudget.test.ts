jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SEARCH_BUDGET_SPENT, searchBudgetSpent } from '../chat.service';

/**
 * Board #959: 92 runs on 4–5 October took over a minute, at about nine model
 * rounds and eleven searches each. A run's searches are capped at eight.
 */
describe('a run’s search budget', () => {
  it('allows eight network searches, then refuses the ninth', () => {
    const run = 'budget-run-1';
    const verdicts = Array.from({ length: 9 }, (_, i) =>
      searchBudgetSpent(run, i % 2 === 0 ? 'search_by_tag' : 'search_second_degree'),
    );
    expect(verdicts.slice(0, 8).every((spent) => !spent)).toBe(true);
    expect(verdicts[8]).toBe(true);
  });

  it('gives the web its own eight, which network searches cannot spend (#7237)', () => {
    const run = 'budget-run-web';
    for (let i = 0; i < 8; i += 1) expect(searchBudgetSpent(run, 'search_by_tag')).toBe(false);
    expect(searchBudgetSpent(run, 'search_by_insight')).toBe(true);
    const web = Array.from({ length: 9 }, (_, i) =>
      searchBudgetSpent(run, i % 2 === 0 ? 'web_search' : 'fetch_page'),
    );
    expect(web.slice(0, 8).every((spent) => !spent)).toBe(true);
    expect(web[8]).toBe(true);
  });

  it('leaves a lookup by name and non-search tools free', () => {
    const run = 'budget-run-2';
    for (let i = 0; i < 8; i += 1) searchBudgetSpent(run, 'search_second_degree');
    expect(searchBudgetSpent(run, 'search_contact_by_name')).toBe(false);
    expect(searchBudgetSpent(run, 'propose_task_plan')).toBe(false);
    expect(searchBudgetSpent(run, 'find_warm_path')).toBe(true);
  });

  it('stops further searches once 25 s have passed since the run first searched (Misho, 27 Oct)', () => {
    const run = 'budget-run-clock';
    const start = 1_000_000;
    expect(searchBudgetSpent(run, 'search_contact_by_name', start)).toBe(false);
    expect(searchBudgetSpent(run, 'web_search', start + 24_000)).toBe(false);
    expect(searchBudgetSpent(run, 'search_by_tag', start + 26_000)).toBe(true);
    expect(searchBudgetSpent(run, 'web_search', start + 26_000)).toBe(true);
  });

  it('keeps a lookup by name and non-search tools free after the clock runs out', () => {
    const run = 'budget-run-clock-free';
    const start = 2_000_000;
    searchBudgetSpent(run, 'search_by_tag', start);
    expect(searchBudgetSpent(run, 'search_contact_by_name', start + 60_000)).toBe(false);
    expect(searchBudgetSpent(run, 'propose_task_plan', start + 60_000)).toBe(false);
  });

  it('tells the model to answer now from what it found', () => {
    expect(SEARCH_BUDGET_SPENT).toContain('Do not search again');
    expect(SEARCH_BUDGET_SPENT).toContain('Write your answer now from what you found');
  });

  it('is checked before a tool runs and forgotten with the run', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('    searchBudgetSpent(runId, name)\n  ) {');
    expect(chat).toContain('runSearchCalls.delete(runId);');
    expect(chat).toContain('runSearchCalls.delete(runId + WEB_BUDGET_KEY_SUFFIX);');
    expect(chat).toContain('runFirstSearchAt.delete(runId);');
  });
});
