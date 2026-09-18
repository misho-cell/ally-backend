jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { withEmptySearchHistory } from '../chat.service';

/**
 * Thread 17726, one goal, 28 search calls. TEN came back empty and cost
 * 42,295 ms between them — and they are all the same idea:
 *
 *   tiler · მეპლიტკე · პლიტკა · santehnikosi · მოპირკეთება · tiler bathroom
 *   მეპლიტკე სააბაზანო · სააბაზანოს მოპირკეთება · …
 *
 * Forty-two seconds of a hundred-and-thirty-second goal spent asking one
 * question in ten spellings. The model is not being careless: an empty result
 * says „no_matches" and nothing else, so each attempt arrives with no memory of
 * the nine before it. Given that, another spelling is the only sensible move.
 *
 * So the empty result carries the run's own history. Not an instruction to
 * stop — a fact about what it has already spent.
 */
const empty = { found: false, reason: 'no_matches' };
const run = (n: string): string => `run-${n}`;

describe('what an empty search tells the run that made it', () => {
  it('says nothing on the first one, because one empty search is just an answer', () => {
    const out = withEmptySearchHistory('search_by_tag', { tag_query: 'tiler' }, run('a'), empty);

    expect(out).toEqual(empty);
  });

  it('hands back the whole list once a second one comes back empty', () => {
    withEmptySearchHistory('search_by_tag', { tag_query: 'tiler' }, run('b'), empty);
    const out = withEmptySearchHistory(
      'search_by_tag',
      { tag_query: 'მეპლიტკე' },
      run('b'),
      empty,
    ) as { already_searched_and_empty: string[]; note: string };

    expect(out.already_searched_and_empty).toEqual([
      'search_by_tag: tiler',
      'search_by_tag: მეპლიტკე',
    ]);
    expect(out.note).toContain('another spelling');
  });

  it('keeps the original answer intact underneath', () => {
    withEmptySearchHistory('search_by_tag', { tag_query: 'a' }, run('c'), empty);
    const out = withEmptySearchHistory('search_by_tag', { tag_query: 'b' }, run('c'), empty) as {
      found: boolean;
      reason: string;
    };

    expect(out.found).toBe(false);
    expect(out.reason).toBe('no_matches');
  });

  it('counts across tools, because the ten were spread over three of them', () => {
    withEmptySearchHistory('search_by_tag', { tag_query: 'tiler' }, run('d'), empty);
    withEmptySearchHistory(
      'search_by_insight',
      { search_query: 'tiler bathroom' },
      run('d'),
      empty,
    );
    const out = withEmptySearchHistory(
      'search_second_degree',
      { tag_query: 'კაფელი' },
      run('d'),
      empty,
    ) as { already_searched_and_empty: string[] };

    expect(out.already_searched_and_empty).toHaveLength(3);
    expect(out.already_searched_and_empty[1]).toContain('search_by_insight');
  });

  it('says nothing about a search that FOUND somebody', () => {
    const found = { found: true, count: 2, results: [{ phone: 'x' }, { phone: 'y' }] };
    withEmptySearchHistory('search_by_tag', { tag_query: 'a' }, run('e'), empty);

    expect(withEmptySearchHistory('search_by_tag', { tag_query: 'b' }, run('e'), found)).toEqual(
      found,
    );
  });

  it('does not count one spelling twice, however often it is retried', () => {
    withEmptySearchHistory('search_by_tag', { tag_query: 'tiler' }, run('f'), empty);
    withEmptySearchHistory('search_by_tag', { tag_query: 'tiler' }, run('f'), empty);
    const out = withEmptySearchHistory('search_by_tag', { tag_query: 'x' }, run('f'), empty) as {
      already_searched_and_empty: string[];
    };

    expect(out.already_searched_and_empty).toEqual(['search_by_tag: tiler', 'search_by_tag: x']);
  });

  it('leaves a non-search tool alone entirely', () => {
    // propose_task_plan returning { ok: false } is not an empty search.
    const refusal = { proposed: false, error: 'x' };

    expect(withEmptySearchHistory('propose_task_plan', {}, run('g'), refusal)).toEqual(refusal);
  });

  it('never carries one run’s history into another', () => {
    withEmptySearchHistory('search_by_tag', { tag_query: 'a' }, run('h'), empty);
    withEmptySearchHistory('search_by_tag', { tag_query: 'b' }, run('h'), empty);
    const other = withEmptySearchHistory('search_by_tag', { tag_query: 'c' }, run('i'), empty);

    expect(other).toEqual(empty);
  });
});
