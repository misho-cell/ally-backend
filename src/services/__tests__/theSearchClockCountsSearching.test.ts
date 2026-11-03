import {
  creditSearchTime,
  forgetSearchClocks,
  searchTimedOut,
  searchTimeSpent,
  SEARCH_WALL_CAP_MS,
  startSearchTiming,
  unionMs,
} from '../searchClock';
import {
  companyNamesIn,
  forgetFinds,
  isFreeCheckOfAFind,
  noteFoundNames,
  noteFoundUrls,
  FREE_PAGE_READS_PER_RUN,
} from '../foundThisRun';

/** Misho, 3 Nov („ლიმიტების თემაზე ყველაფერი გააკეთე"). */
describe('the search clock counts the time searches ran', () => {
  it('lets one big parallel batch through (#8619 retest 3: 16 tag searches, 26 s)', () => {
    const key = 'clock-batch';
    for (let i = 0; i < 16; i += 1) startSearchTiming(key, 0)(11_000 + i * 1_000);
    expect(searchTimeSpent(key, 27_000)).toBe(false);
    forgetSearchClocks([key]);
  });

  it('counts parallel searches once', () => {
    expect(
      unionMs(
        [
          { start: 0, end: 10_000 },
          { start: 2_000, end: 8_000 },
          { start: 20_000, end: 25_000 },
        ],
        30_000,
      ),
    ).toBe(15_000);
  });

  it('gives back the time of a search that timed out, and of the way_in check', () => {
    const key = 'clock-credit';
    startSearchTiming(key, 0)(65_000);
    expect(searchTimeSpent(key, 65_000)).toBe(true);
    creditSearchTime(key, 10_000, 65_000);
    expect(searchTimeSpent(key, 65_000)).toBe(false);
    forgetSearchClocks([key]);
  });

  it('still bounds a run by a wall cap', () => {
    const key = 'clock-wall';
    startSearchTiming(key, 0)(1_000);
    expect(searchTimeSpent(key, SEARCH_WALL_CAP_MS + 1)).toBe(true);
    forgetSearchClocks([key]);
  });

  it('reads a timed-out search', () => {
    expect(searchTimedOut({ found: false, reason: 'search_timed_out' })).toBe(true);
    expect(searchTimedOut({ found: false, reason: 'no_match' })).toBe(false);
  });
});

describe('checking what the run just found is not a new search', () => {
  it('reads a page the run’s web results gave, up to a cap', () => {
    const run = 'finds-pages';
    noteFoundUrls(run, { results: [{ url: 'https://zedazeni.ge/ka/team' }] });
    expect(isFreeCheckOfAFind(run, 'fetch_page', { url: 'https://zedazeni.ge/ka/team/' })).toBe(
      true,
    );
    expect(isFreeCheckOfAFind(run, 'fetch_page', { url: 'https://elsewhere.ge' })).toBe(false);
    for (let i = 1; i < FREE_PAGE_READS_PER_RUN; i += 1)
      isFreeCheckOfAFind(run, 'fetch_page', { url: 'https://zedazeni.ge/ka/team' });
    expect(isFreeCheckOfAFind(run, 'fetch_page', { url: 'https://zedazeni.ge/ka/team' })).toBe(
      false,
    );
    forgetFinds(run);
  });

  it('searches the network for a firm the web or the company base found', () => {
    const run = 'finds-names';
    noteFoundNames(
      run,
      companyNamesIn({ companies: [{ name: 'Mem’s Karides' }, { name: 'TBC Bank JSC' }] }),
    );
    expect(isFreeCheckOfAFind(run, 'search_second_degree', { tag_query: 'Mem’s Karides' })).toBe(
      true,
    );
    expect(isFreeCheckOfAFind(run, 'search_by_tag', { tag_query: 'tbc bank jsc' })).toBe(true);
    expect(isFreeCheckOfAFind(run, 'search_by_tag', { tag_query: 'shrimp' })).toBe(false);
    expect(isFreeCheckOfAFind(run, 'web_search', { query: 'Mem’s Karides' })).toBe(false);
    forgetFinds(run);
  });
});
