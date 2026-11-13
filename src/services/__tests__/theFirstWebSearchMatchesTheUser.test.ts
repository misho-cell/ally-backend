import { readFileSync } from 'fs';
import { join } from 'path';

import {
  countWebSearch,
  firstSearchLanguageNote,
  firstSearchNotInLanguage,
  forgetWebSearches,
  MAX_SEARCHES_PER_QUESTION,
  searchRoundNote,
} from '../webSearchRounds';

/**
 * Misho, 13 Nov: a real member asked who heads Rompetrol Georgia; our one
 * English search found the group's Romanian pages. The first web search is in
 * the language the owner is writing in, and up to five different searches
 * follow when it does not answer, the model choosing each next one.
 */
describe('the first web search of a run', () => {
  const run = 'run-lang-first';
  afterEach(() => forgetWebSearches(run));

  it('for a Georgian conversation, is refused unless it carries Georgian', () => {
    expect(firstSearchNotInLanguage(run, 'ka', 'Rompetrol Georgia General Director')).toBe(true);
    expect(firstSearchNotInLanguage(run, 'ka', 'ვინ არის Rompetrol საქართველოს დირექტორი')).toBe(
      false,
    );
  });

  it('for an English conversation, a plain English search goes', () => {
    expect(firstSearchNotInLanguage(run, 'en', 'Rompetrol Georgia General Director')).toBe(false);
  });

  it('for a Russian conversation, wants Cyrillic', () => {
    expect(firstSearchNotInLanguage(run, 'ru', 'Rompetrol director')).toBe(true);
    expect(firstSearchNotInLanguage(run, 'ru', 'кто директор Rompetrol')).toBe(false);
  });

  it('only binds the first search; later ones may be any language', () => {
    countWebSearch(run);
    expect(firstSearchNotInLanguage(run, 'ka', 'Rompetrol Georgia General Director')).toBe(false);
  });

  it('names the conversation’s language when it refuses', () => {
    expect(firstSearchLanguageNote('ka')).toContain('Georgian');
    expect(firstSearchLanguageNote('en')).toContain('English');
    expect(firstSearchLanguageNote('ru')).toContain('Russian');
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

  it('refuses before the search budget is spent, by the run’s own language', () => {
    const refusal = chat.indexOf('firstSearchNotInLanguage(runId, runLang(runId)');
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
