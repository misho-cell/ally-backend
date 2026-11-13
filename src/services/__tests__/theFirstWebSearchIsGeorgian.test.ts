import { readFileSync } from 'fs';
import { join } from 'path';

import {
  countWebSearch,
  firstSearchNotInGeorgian,
  forgetWebSearches,
  MAX_SEARCHES_PER_QUESTION,
  searchRoundNote,
} from '../webSearchRounds';

/**
 * Misho, 13 Nov (a real member asked who heads Rompetrol Georgia): our one
 * English search found the group's Romanian pages; a Georgian search answers
 * it. The first web search is in Georgian, and up to five different searches
 * follow when it does not answer, the model choosing each next one.
 */
describe('the first web search of a run', () => {
  const run = 'run-georgian-first';
  afterEach(() => forgetWebSearches(run));

  it('is refused when it has no Georgian in it', () => {
    expect(firstSearchNotInGeorgian(run, 'Rompetrol Georgia General Director')).toBe(true);
  });

  it('goes when it is in Georgian, a Latin company name inside it included', () => {
    expect(firstSearchNotInGeorgian(run, 'ვინ არის Rompetrol საქართველოს დირექტორი')).toBe(false);
  });

  it('is followed by searches in any language', () => {
    countWebSearch(run);
    expect(firstSearchNotInGeorgian(run, 'Rompetrol Georgia General Director')).toBe(false);
  });
});

describe('each web search result', () => {
  const run = 'run-rounds';
  afterEach(() => forgetWebSearches(run));

  it('says which search it is and to choose a different next one', () => {
    const note = searchRoundNote(countWebSearch(run));
    expect(note).toContain(`1 of up to ${MAX_SEARCHES_PER_QUESTION}`);
    expect(note).toContain('decide the next search yourself');
  });

  it('says to stop and tell what was found at the fifth', () => {
    let made = 0;
    for (let i = 0; i < MAX_SEARCHES_PER_QUESTION; i += 1) made = countWebSearch(run);
    expect(searchRoundNote(made)).toContain('say plainly what you found and what you did not');
  });

  it('is counted per run, and a finished run forgets its count', () => {
    countWebSearch(run);
    forgetWebSearches(run);
    expect(countWebSearch(run)).toBe(1);
  });
});

describe('the wiring', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const web = readFileSync(join(__dirname, '..', 'tools', 'webSearch.ts'), 'utf8');

  it('refuses before the search budget is spent, and the round rides with the results', () => {
    const refusal = chat.indexOf('firstSearchNotInGeorgian(runId');
    const budget = chat.indexOf('searchBudgetSpent(runId, name)');
    expect(refusal).toBeGreaterThan(0);
    expect(refusal).toBeLessThan(budget);
    expect(chat).toContain('search_round: searchRoundNote(countWebSearch(runId))');
    expect(chat).toContain('forgetWebSearches(runId);');
  });

  it('hands Gemini the question as written', () => {
    expect(web).toContain('geminiSearch(query, geminiKey())');
  });
});
