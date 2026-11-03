jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MAX_NETWORK_SEARCHES_PER_RUN,
  MAX_WEB_SEARCHES_PER_RUN,
  SEARCH_BUDGET_SPENT,
  searchBudgetSpent,
} from '../chat.service';
import { startSearchTiming } from '../searchClock';

/**
 * Board #959: 92 runs on 4–5 October took over a minute, at about nine model
 * rounds and eleven searches each. A run's searches are capped — since #8619's
 * retest (81578) per kind — now 40 network and 16 web, each kind bounded by its own clock.
 */
describe('a run’s search budget', () => {
  it('allows three kinds of network search for 8 companies, then refuses past the cap', () => {
    const run = 'budget-run-1';
    const kinds = ['search_by_tag', 'search_second_degree', 'search_by_insight'];
    const verdicts = Array.from({ length: MAX_NETWORK_SEARCHES_PER_RUN + 1 }, (_, i) =>
      searchBudgetSpent(run, kinds[i % kinds.length]),
    );
    expect(MAX_NETWORK_SEARCHES_PER_RUN).toBeGreaterThanOrEqual(8 * kinds.length);
    expect(verdicts.slice(0, MAX_NETWORK_SEARCHES_PER_RUN).every((spent) => !spent)).toBe(true);
    expect(verdicts[MAX_NETWORK_SEARCHES_PER_RUN]).toBe(true);
  });

  it('gives the web its own 16, which network searches cannot spend (#7237)', () => {
    const run = 'budget-run-web';
    for (let i = 0; i < MAX_NETWORK_SEARCHES_PER_RUN; i += 1) {
      expect(searchBudgetSpent(run, 'search_by_tag')).toBe(false);
    }
    expect(searchBudgetSpent(run, 'search_by_insight')).toBe(true);
    const web = Array.from({ length: MAX_WEB_SEARCHES_PER_RUN + 1 }, (_, i) =>
      searchBudgetSpent(run, i % 2 === 0 ? 'web_search' : 'fetch_page'),
    );
    expect(web.slice(0, MAX_WEB_SEARCHES_PER_RUN).every((spent) => !spent)).toBe(true);
    expect(web[MAX_WEB_SEARCHES_PER_RUN]).toBe(true);
  });

  it('leaves a lookup by name and non-search tools free', () => {
    const run = 'budget-run-2';
    for (let i = 0; i < MAX_NETWORK_SEARCHES_PER_RUN; i += 1) {
      searchBudgetSpent(run, 'search_second_degree');
    }
    expect(searchBudgetSpent(run, 'search_contact_by_name')).toBe(false);
    expect(searchBudgetSpent(run, 'propose_task_plan')).toBe(false);
    expect(searchBudgetSpent(run, 'find_warm_path')).toBe(true);
  });

  it('stops further network searches once the network has searched for a minute (Misho, 27 Oct; 3 Nov)', () => {
    const run = 'budget-run-clock';
    const start = 1_000_000;
    const done = startSearchTiming(run, start);
    done(start + 61_000);
    expect(searchBudgetSpent(run, 'search_by_tag', start + 61_500)).toBe(true);
  });

  it('gives the web its own clock, which cannot spend the network’s (#8619, D903)', () => {
    const run = 'budget-run-two-clocks';
    const start = 3_000_000;
    startSearchTiming(`${run}:web`, start)(start + 61_000);
    expect(searchBudgetSpent(run, 'web_search', start + 62_000)).toBe(true);
    expect(searchBudgetSpent(run, 'search_by_tag', start + 62_000)).toBe(false);
  });

  it('does not count the model’s rounds between searches (Misho, 3 Nov)', () => {
    const run = 'budget-run-rounds';
    const start = 4_000_000;
    startSearchTiming(run, start)(start + 5_000);
    // 40 s of the model thinking, then another short search.
    startSearchTiming(run, start + 45_000)(start + 50_000);
    expect(searchBudgetSpent(run, 'search_second_degree', start + 50_100)).toBe(false);
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
    expect(chat).toContain('forgetSearchClocks([runId, runId + WEB_BUDGET_KEY_SUFFIX]);');
    expect(chat).toContain('forgetFinds(runId);');
    expect(chat).toContain('const searchDone = timeSearch(runId, block.name);');
  });
});
