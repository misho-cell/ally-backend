jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { withEmptySearchHistory } from '../chat.service';
import { matchShapeOf } from '../resultShape';
import { searchDidNotFinish } from '../tools/searchDidNotFinish';

/**
 * Row 321, Giorgi, 29 Sep 08:47:01: both lawyer searches timed out on his
 * 1,174-contact phonebook, and the model was told „found nobody" — the
 * empty-search history treated found:false as empty and overwrote the
 * „DID NOT FINISH" note. Nine lawyers sat in his phonebook.
 */
describe('a search that timed out is never an empty network', () => {
  const timedOut = searchDidNotFinish(
    'The tag search',
    new Error('canceling statement due to statement timeout'),
  );

  it('keeps the did-not-finish result and its note untouched', () => {
    withEmptySearchHistory('search_by_tag', { tag_query: 'იურისტი' }, 'run-321', { found: false });
    const out = withEmptySearchHistory(
      'search_by_tag',
      { tag_query: 'ადვოკატი' },
      'run-321',
      timedOut,
    );
    expect(out).toBe(timedOut);
    expect((out as { note: string }).note).toMatch(/DID NOT FINISH/);
    expect(out).not.toHaveProperty('empty_searches_so_far');
  });

  it('labels it as not finished in the result sample', () => {
    expect(matchShapeOf({ ...timedOut, empty_searches_so_far: 2 })).toBe(
      'no rows — search_timed_out',
    );
  });

  it('still treats an honest empty result as empty', () => {
    withEmptySearchHistory('search_by_tag', { tag_query: 'a' }, 'run-empty', { found: false });
    const out = withEmptySearchHistory('search_by_tag', { tag_query: 'b' }, 'run-empty', {
      found: false,
    });
    expect(out).toHaveProperty('empty_searches_so_far');
  });

  it('gives the exact tag search more than the pool default, on its two queries and the way-in pass', () => {
    const src = readFileSync(join(__dirname, '..', 'tools', 'searchByTag.ts'), 'utf8');
    expect(src).toContain('const EXACT_SEARCH_TIMEOUT_MS = 20_000;');
    // The page and its COUNT, and #959's one pass for many way-in names.
    expect(src.match(/EXACT_SEARCH_TIMEOUT_MS,\n/g)?.length).toBe(3);
  });
});
