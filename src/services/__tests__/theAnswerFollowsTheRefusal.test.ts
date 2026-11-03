jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { searchesPastTheBudget, searchBudgetSpent } from '../chat.service';

/** #8681: after a search-limit refusal the run kept searching and answered ~6 min late. */
describe('the answer follows a budget refusal (#8681)', () => {
  it('starts no round that only searches again once a search was refused', () => {
    const run = 'past-budget-run';
    expect(searchesPastTheBudget(run, ['web_search', 'fetch_page'])).toBe(false);
    // The run is marked when the gate refuses; the loop condition reads the mark.
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('runsPastTheirBudget.add(runId);');
    expect(chat).toContain('!searchesPastTheBudget(');
    expect(searchBudgetSpent(run, 'web_search')).toBe(false);
  });

  it('lets a round that proposes a plan or asks someone go on', () => {
    expect(searchesPastTheBudget('any-run', ['propose_task_plan'])).toBe(false);
    expect(searchesPastTheBudget('any-run', [])).toBe(false);
  });
});
