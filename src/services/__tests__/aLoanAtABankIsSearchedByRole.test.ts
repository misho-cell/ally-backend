jest.mock('../tools/webSearch', () => ({ webSearch: jest.fn(), fetchPage: jest.fn() }));
jest.mock('../costLedger.service', () => ({ recordFixedUsage: jest.fn() }));
jest.mock('../toolCallLog.service', () => ({ logToolCall: jest.fn() }));

import { fetchPage, webSearch } from '../tools/webSearch';
import { recordFixedUsage } from '../costLedger.service';
import { logToolCall } from '../toolCallLog.service';
import {
  buildRoleSearchSection,
  lenderNamedIn,
  roleSearchQueries,
  runRoleSearch,
  urlsOnSites,
  currentPagesFirst,
  stretchAboutLendingPeople,
  pageText,
  MIN_PAGE_CHARS,
} from '../roleWebSearch.service';

const mockedSearch = webSearch as jest.MockedFunction<typeof webSearch>;
const mockedFetch = fetchPage as jest.MockedFunction<typeof fetchPage>;
const mockedUsage = recordFixedUsage as jest.MockedFunction<typeof recordFixedUsage>;
const RUN = { userId: '187879', runId: 'run-5248', threadId: 59071 } as const;
const LIKAS_TEXT =
  'თიბისიში ვინმე მჭირდება, ვინც ჩემს ბიზნეს სესხის განაცხადს უპასუხებს — სამი კვირაა ელოდება.';

describe('#5248 (D825): a loan at a bank is searched by role before the first answer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsage.mockResolvedValue(undefined);
    mockedFetch.mockResolvedValue({ content: null });
  });

  it('builds the role query in English and Georgian for Lika’s TBC text', () => {
    const queries = roleSearchQueries(LIKAS_TEXT);
    expect(queries?.en).toBe('TBC Bank SME business lending head');
    expect(queries?.ka).toBe('თიბისი ბანკი მცირე და საშუალო ბიზნესის დაკრედიტების ხელმძღვანელი');
  });

  it('reads the English spelling too', () => {
    expect(roleSearchQueries('someone at TBC who can answer my business loan')?.en).toBe(
      'TBC Bank SME business lending head',
    );
    expect(lenderNamedIn('a mortgage at Bank of Georgia')?.en).toBe('Bank of Georgia');
  });

  it('runs no role search without a lender or without a lending need', () => {
    expect(roleSearchQueries('ბიზნეს სესხი მჭირდება')).toBeNull();
    expect(roleSearchQueries('თიბისიში ანგარიში გავხსენი, ბარათი არ მოსულა')).toBeNull();
    expect(roleSearchQueries('I need a wedding photographer in Kutaisi')).toBeNull();
  });

  it('runs both queries, charges and logs each one', async () => {
    mockedSearch.mockResolvedValue({ results: [{ title: 'Head of SME', url: 'https://x.ge' }] });
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    const finds = await runRoleSearch(RUN, queries);
    expect(mockedSearch.mock.calls.map((call) => call[0])).toEqual([
      queries.en,
      queries.ka,
      queries.managementNews,
      ...queries.managementPages,
    ]);
    expect(queries.managementPages).toEqual([
      'TBC Bank management board leadership team site:tbcbank.ge',
      'TBC Bank management board leadership team site:tbcbankgroup.com',
    ]);
    expect(mockedUsage).toHaveBeenCalledTimes(6); // 5 searches + 1 page read (the news result)
    expect(logToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'web_search:role', input: { query: queries.en } }),
    );
    expect(finds.results.every((found) => found.result !== null)).toBe(true);
  });

  it('keeps the half that answered when the other fails', async () => {
    mockedSearch
      .mockResolvedValueOnce({ results: [{ title: 'Head of SME', url: 'https://x.ge' }] })
      .mockRejectedValueOnce(new Error('search down'))
      .mockResolvedValueOnce({ results: [] });
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    const finds = await runRoleSearch(RUN, queries);
    expect(finds.results.map((found) => found.result === null)).toEqual([false, true]);
    const section = buildRoleSearchSection(finds);
    expect(section).toContain('## როლით ძიება');
    expect(section).toContain(`### ${queries.en}`);
    expect(section).not.toContain(`### ${queries.ka}`);
  });

  it('writes no section when neither query answered', async () => {
    mockedSearch.mockRejectedValue(new Error('search down'));
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    expect(buildRoleSearchSection(await runRoleSearch(RUN, queries))).toBe('');
  });

  it('reads the bank’s own management page and hands it over as a page read', async () => {
    const page = 'https://www.tbcbank.ge/en/about/management';
    mockedSearch.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('site:tbcbank.ge')
          ? { results: [{ url: 'https://news.ge/x' }, { url: page }] }
          : { results: [] },
      ),
    );
    mockedFetch.mockResolvedValue({
      url: page,
      content: `Management Board — Head of SME Banking ${'x'.repeat(250)}`,
    });
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    const finds = await runRoleSearch(RUN, queries);
    expect(mockedFetch).toHaveBeenCalledWith(page, 0);
    expect(finds.managementPage?.url).toBe(page);
    const section = buildRoleSearchSection(finds);
    expect(section).toContain(`ბანკის მენეჯმენტზე წაკითხული გვერდი: ${page}`);
    expect(section).toContain('Head of SME Banking');
  });

  it('reads the next page when the bank’s own page comes back empty (tester 19:10Z)', async () => {
    const empty = 'https://www.tbcbank.ge/en/tbc/about-us/corporate-governance';
    const board = 'https://www.tbcbankgroup.com/about-us/management-board';
    mockedSearch.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('site:tbcbank.ge')
          ? { results: [{ url: empty }] }
          : query.includes('site:tbcbankgroup.com')
            ? { results: [{ url: board }] }
            : { results: [] },
      ),
    );
    mockedFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url === empty
          ? { url, content: 'TBC' }
          : { url, content: `Head of SME ${'x'.repeat(250)}` },
      ),
    );
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    const finds = await runRoleSearch(RUN, queries);
    expect(mockedFetch.mock.calls.map((call) => call[0])).toEqual([empty, board]);
    expect(finds.managementPage?.url).toBe(board);
  });

  it('takes only pages that live on the bank’s own sites, once each', () => {
    const sites = ['tbcbank.ge', 'tbcbankgroup.com'];
    const found = {
      results: [
        { url: 'https://tbcbank.ge.evil.com/a' },
        { url: 'https://news.ge' },
        { url: 'https://tbcbank.ge/m' },
        { url: 'https://www.tbcbankgroup.com/b' },
        { url: 'https://tbcbank.ge/m' },
      ],
    };
    expect(urlsOnSites(found, sites)).toEqual([
      'https://tbcbank.ge/m',
      'https://www.tbcbankgroup.com/b',
    ]);
  });
  it('counts a page of a few characters as empty (tester 20:27Z, "chars 3")', () => {
    expect(pageText({ content: 'TBC' })).toBeNull();
    expect(pageText({ content: 'x'.repeat(MIN_PAGE_CHARS) })).not.toBeNull();
  });

  it('reads further parts of a long page and hands over the stretch that names the board (21:12Z)', async () => {
    const page = 'https://www.tbcbankgroup.com/about-us/management-board';
    mockedSearch.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('site:tbcbankgroup.com') ? { results: [{ url: page }] } : { results: [] },
      ),
    );
    const menus = 'Menu Investors Careers '.repeat(400);
    mockedFetch.mockImplementation((url: string, from?: number) =>
      Promise.resolve(
        from === 0
          ? { url, content: menus, next_from_character: 8000 }
          : {
              url,
              content:
                'Management Board: Head of SME and Business Banking, A. Person.' + 'x'.repeat(200),
            },
      ),
    );
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    const finds = await runRoleSearch(RUN, queries);
    expect(mockedFetch.mock.calls.map((call) => call[1])).toEqual([0, 8000]);
    expect(finds.managementPage?.text).toContain('Head of SME and Business Banking');
    expect(finds.managementPage?.text.startsWith('Menu')).toBe(false);
  });

  it('keeps a short lead-in before the board heading', () => {
    const text = `${'nav '.repeat(500)}Management Board — names`;
    const stretch = stretchAboutLendingPeople(text);
    expect(stretch).toContain('Management Board — names');
    expect(stretch.length).toBeLessThan(text.length);
  });

  it('drops a report dated in its title, and reads the newest page first (tester 23:51Z)', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    const page = (url: string, title = '') => ({ url, title });
    expect(
      currentPagesFirst(
        [
          page(
            'https://www.tbcbankgroup.com/ar/risk',
            'TBC Bank Annual Report 2015 — Risk management',
          ),
          page('https://www.tbcbankgroup.com/news/rates'),
          page('https://www.tbcbankgroup.com/reports/annual-report-2025.pdf'),
          page('https://www.tbcbankgroup.com/about-us/management-board'),
          page('https://georgiatoday.ge/x', 'TBC strengthens its management team (2026)'),
        ],
        now,
      ).map((p) => p.url),
    ).toEqual([
      'https://georgiatoday.ge/x',
      'https://www.tbcbankgroup.com/reports/annual-report-2025.pdf',
      'https://www.tbcbankgroup.com/about-us/management-board',
      'https://www.tbcbankgroup.com/news/rates',
    ]);
  });
});
