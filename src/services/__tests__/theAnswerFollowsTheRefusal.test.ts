jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SEARCH_PHASE_CAP_MS,
  searchesPastTheBudget,
  searchBudgetSpent,
  unrunSearchResults,
} from '../chat.service';

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

/** #8681 retest (82303): searching ran 3:20–3:40 into a 3-minute limit. */
describe('searching ends in time for the answer (#8681 retest)', () => {
  it('starts no search-only round past the search phase, refusal or not', () => {
    expect(searchesPastTheBudget('fresh-run', ['web_search'], SEARCH_PHASE_CAP_MS + 1)).toBe(true);
    expect(searchesPastTheBudget('fresh-run', ['web_search'], SEARCH_PHASE_CAP_MS - 1)).toBe(false);
  });

  it('still lets a plan or an ask through after it', () => {
    expect(searchesPastTheBudget('fresh-run', ['propose_task_plan'], SEARCH_PHASE_CAP_MS + 1)).toBe(
      false,
    );
  });
});

/** #8681 retest 2 (82402): the guard after the loop ran the declined searches anyway. */
describe('a round declined for time is not run', () => {
  it('answers every asked search without running it', () => {
    const results = unrunSearchResults([
      { type: 'text', text: 'ვეძებ', citations: null },
      { type: 'tool_use', id: 'tu1', name: 'web_search', input: {} },
      { type: 'tool_use', id: 'tu2', name: 'search_by_tag', input: {} },
    ] as never);
    expect(results.map((r) => r.tool_use_id)).toEqual(['tu1', 'tu2']);
    expect(results.every((r) => r.is_error === true)).toBe(true);
  });

  it('is what the guard uses when the loop declined the round', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('? unrunSearchResults(response.content)');
  });
});

/** #8681 retest 2 (82402): a 118 s final was written and then discarded for the writer's. */
describe('the final the writer replaces is not written first', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('leaves the forced final to the writer when one is set', () => {
    expect(chat).toContain("if (writer !== '') {");
    expect(chat).toContain('claudeFinalSkipped = true;');
  });

  it('writes it after all when the writer fails or comes back empty', () => {
    expect(chat).toContain('if (rewritten === null) await claudeFinalIfSkipped();');
    expect(chat.match(/await claudeFinalIfSkipped\(\);/g)?.length).toBe(2);
  });

  it('never takes the skipped, empty final for a short answer that stands', () => {
    expect(chat).toContain("!claudeFinalSkipped &&\n      writer !== '' &&");
  });
});
