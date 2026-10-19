import { fetchPage, webSearch } from './tools/webSearch';
import { withPublicProfile } from './tools/publicProfileRead';
import { recordFixedUsage } from './costLedger.service';
import { logToolCall } from './toolCallLog.service';
import { webTitles } from './openingSearch.service';

/**
 * #5248 (D825, the founder 18 Oct, option 3 (a)) — the role search runs before
 * the first answer.
 *
 * The real TBC case and three fresh seats since (box 67203, 0 of 3): a goal
 * names an institution and a stuck business loan, and the run stops at the
 * owner's own contact who carries the bank's name, asks them, and never looks
 * for the person whose job the loan is. The opening web search does not help,
 * because it is asked the goal's own words and finds the product page.
 *
 * So the server asks the web the ROLE: „<institution> SME business lending
 * head", in English and in Georgian, and hands the people it finds, with their
 * pages, to the run before it writes anything. Narrow on purpose: an
 * institution from the list below AND a lending need. Anything else is the
 * prompt's, and a wrong yes here would put a role search on every goal.
 *
 * Second pass (the tester's 67420, 0 of 3): the searches ran and the run still
 * named nobody, because a search SNIPPET is not a source a name may come from
 * (D151) — „could not confirm the head's name on an official source". So the
 * server now also READS: the bank's own management page, found by a search
 * kept to the bank's own site, and any public profile among the role results,
 * exactly as the model's own web_search reads one. A page read is evidence.
 */

/** A role search on the first answer's path waits this long, and no longer. */
const ROLE_SEARCH_BUDGET_MS = 8_000;
/** The management page may need a second page, and up to three parts of it. */
const MANAGEMENT_PAGE_BUDGET_MS = 20_000;

/** The results handed to the model, per query. */
const MAX_SECTION_CHARS_PER_QUERY = 3_000;

/** The bank's own management page, as much of it as the model is handed. */
const MAX_PAGE_CHARS = 6_000;

const TAVILY_LEDGER = {
  kind: 'web_search',
  provider: 'tavily',
  priceKey: 'tavily.search',
} as const;

export interface Institution {
  /** How the web knows it, in English. */
  readonly en: string;
  /** How a Georgian page writes it. */
  readonly ka: string;
  /** Every spelling an owner types; matched case-insensitively as written. */
  readonly spellings: RegExp;
  /**
   * The bank's own sites, where its management page lives: the bank's, and its
   * listed group's when it has one. The tester's 19:10Z retest: tbcbank.ge's
   * corporate-governance page came back EMPTY (drawn in the browser), so the
   * group's site, whose board pages are plain text, is searched too.
   */
  readonly sites: readonly string[];
}

/** The lenders owners ask about; the stems catch „თიბისიში", „ბანკის" and the rest. */
const LENDERS: readonly Institution[] = [
  {
    en: 'TBC Bank',
    ka: 'თიბისი ბანკი',
    spellings: /\bTBC\b|თიბისი|ტიბისი/iu,
    sites: ['tbcbank.ge', 'tbcbankgroup.com'],
  },
  {
    en: 'Bank of Georgia',
    ka: 'საქართველოს ბანკი',
    spellings: /\bBank of Georgia\b|\bBOG\b|საქართველოს ბანკ/iu,
    sites: ['bankofgeorgia.ge', 'bankofgeorgiagroup.com'],
  },
  {
    en: 'Liberty Bank',
    ka: 'ლიბერთი ბანკი',
    spellings: /\bLiberty Bank\b|ლიბერთი/iu,
    sites: ['libertybank.ge'],
  },
  {
    en: 'Basisbank',
    ka: 'ბაზისბანკი',
    spellings: /\bBasis\s?bank\b|ბაზისბანკ/iu,
    sites: ['basisbank.ge'],
  },
  {
    en: 'ProCredit Bank',
    ka: 'პროკრედიტ ბანკი',
    spellings: /\bProCredit\b|პროკრედიტ/iu,
    sites: ['procreditbank.ge'],
  },
  {
    en: 'Credo Bank',
    ka: 'კრედო ბანკი',
    spellings: /\bCredo\b|კრედო/iu,
    sites: ['credobank.ge'],
  },
];

/** A loan, a credit line, lending — in the words owners use. */
const LENDING_NEED =
  /\b(loans?|lending|credit line|credit|mortgage)\b|სესხ|კრედიტ|დაკრედიტ|ლიზინგ|იპოთეკ/iu;

/** The role that owns a business loan, as each language's pages title it. */
const LENDING_ROLE = {
  en: 'SME business lending head',
  ka: 'მცირე და საშუალო ბიზნესის დაკრედიტების ხელმძღვანელი',
} as const;

export interface RoleQueries {
  readonly institution: Institution;
  readonly en: string;
  readonly ka: string;
  /** Find the management page, one query per own site. */
  readonly managementPages: readonly string[];
  /** Current news about the bank's management, on any site. */
  readonly managementNews: string;
}

/** The first listed lender the text names, or null. */
export function lenderNamedIn(text: string): Institution | null {
  return LENDERS.find((lender) => lender.spellings.test(text)) ?? null;
}

/** The two role queries for a goal that names a lender and a lending need; null otherwise. */
export function roleSearchQueries(goalText: string): RoleQueries | null {
  if (!LENDING_NEED.test(goalText)) return null;
  const institution = lenderNamedIn(goalText);
  if (institution === null) return null;
  return {
    institution,
    en: `${institution.en} ${LENDING_ROLE.en}`,
    ka: `${institution.ka} ${LENDING_ROLE.ka}`,
    managementNews: `${institution.en} management team SME business banking head ${new Date().getUTCFullYear()}`,
    managementPages: institution.sites.map(
      (site) => `${institution.en} management board leadership team site:${site}`,
    ),
  };
}

export interface RoleSearchResult {
  readonly query: string;
  /** The search tool's own result; null when it failed or ran out of time. */
  readonly result: unknown;
}

export interface ManagementPage {
  readonly url: string;
  /** The page's own text, clipped. */
  readonly text: string;
}

export interface RoleSearchFinds {
  readonly queries: RoleQueries;
  readonly results: readonly RoleSearchResult[];
  /** The bank's own management page, read; null when none was found or read. */
  readonly managementPage: ManagementPage | null;
}

export interface RoleSearchRun {
  readonly userId: string;
  readonly runId: string;
  readonly threadId: number;
}

/** Resolves to null when the work does not finish inside the budget or fails. */
function withinBudget<T>(
  work: Promise<T>,
  query: string,
  budgetMs: number = ROLE_SEARCH_BUDGET_MS,
): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  const guarded = work.catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[role-search] "${query}" failed:`, (err as Error).message);
    return null;
  });
  return Promise.race([guarded, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Every Tavily call is charged like the model's own web_search. */
async function charge(run: RoleSearchRun): Promise<void> {
  await recordFixedUsage({ userId: run.userId, runId: run.runId, ...TAVILY_LEDGER }).catch(
    (err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[role-search] ledger write failed:', (err as Error).message);
    },
  );
}

function logRoleCall(
  run: RoleSearchRun,
  tool: string,
  input: Record<string, unknown>,
  result: unknown,
  startedAt: number,
  sample: string = webTitles(result),
): void {
  void logToolCall({
    threadId: run.threadId,
    surface: 'chat',
    runId: run.runId,
    userId: run.userId,
    tool,
    input,
    result,
    durationMs: Date.now() - startedAt,
    resultSample: sample,
  });
}

/** A role query, with a public profile among its results read as the model's own search does. */
async function searchAndReadProfile(run: RoleSearchRun, query: string): Promise<object> {
  return withPublicProfile(
    await webSearch(query),
    (url) => fetchPage(url),
    () => charge(run),
  );
}

/** One role query: charged and logged like the opening web search. */
async function searchOneRole(run: RoleSearchRun, query: string): Promise<RoleSearchResult> {
  await charge(run);
  const startedAt = Date.now();
  const result = await withinBudget(searchAndReadProfile(run, query), query);
  logRoleCall(run, 'web_search:role', { query }, result, startedAt);
  return { query, result };
}

/** Pages tried, in order, until one comes back with text. */
const MAX_PAGES_READ = 3;

function isOnSite(url: string, sites: readonly string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return sites.some((site) => host === site || host.endsWith(`.${site}`));
  } catch {
    return false;
  }
}

/** One search result that may be read: its address and its title. */
export interface PageCandidate {
  readonly url: string;
  readonly title: string;
}

/** Every result, or every result on one of the given sites, in order, without repeats. */
export function candidatesFrom(found: unknown, sites: readonly string[] | null): PageCandidate[] {
  if (found === null || typeof found !== 'object') return [];
  const rows = (found as { results?: unknown }).results;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: PageCandidate[] = [];
  for (const row of rows) {
    const { url, title } = (row ?? {}) as { url?: unknown; title?: unknown };
    if (typeof url !== 'string' || seen.has(url)) continue;
    if (sites !== null && !isOnSite(url, sites)) continue;
    seen.add(url);
    out.push({ url, title: typeof title === 'string' ? title : '' });
  }
  return out;
}

/** Every result that lives on one of the bank's own sites, in order, without repeats. */
export function urlsOnSites(found: unknown, sites: readonly string[]): string[] {
  return candidatesFrom(found, sites).map((page) => page.url);
}

/**
 * Fewer characters than this is a page with nothing on it. The tester's
 * 20:27Z retest: tbcbank.ge's governance page came back with 3 characters,
 * which counted as text, so the next page was never read. The tester's 06:35Z
 * retest: a page built by script returns little more than its title, so
 * anything under 500 characters is empty too.
 */
export const MIN_PAGE_CHARS = 500;
/** How much of a read page its log row keeps. */
const PAGE_SAMPLE_CHARS = 300;
/** How much of the page before the board's heading is kept, for its context. */
const PAGE_LEAD_IN_CHARS = 300;

/** The page text a fetch returned, or null when it brought none worth reading. */
export function pageText(fetched: unknown): string | null {
  const content = (fetched as { content?: unknown } | null)?.content;
  return typeof content === 'string' && content.trim().length >= MIN_PAGE_CHARS ? content : null;
}

/** One management-page search on one own site, charged and logged. */
async function searchManagementPage(run: RoleSearchRun, query: string): Promise<unknown> {
  await charge(run);
  const startedAt = Date.now();
  const found = await webSearch(query);
  logRoleCall(run, 'web_search:role', { query }, found, startedAt);
  return found;
}

/** A read page shown in parts: how many parts are read, at most. */
const MAX_PAGE_PARTS = 3;

/**
 * #5248: where in a long report today's people are named. A first read starts
 * where these are densest, not on the cover (the tester's 07:15Z). Role words
 * alone landed on the ESG committees (07:53Z: every committee lists „the Chief
 * Executive Officer"), so it is a NAME beside a title — „Firstname Lastname,
 * Chief Executive Officer", or the title then the name — which only the
 * management list carries.
 */
const TITLE =
  '(?:Group\\s+)?(?:Chief\\s+[A-Z][a-z]+\\s+Officer|Deputy\\s+CEO|CEO|Member\\s+of\\s+the\\s+Management\\s+Board|Head\\s+of\\s+[A-Z][A-Za-z]+)';
const PERSON = '[A-Z][a-z]+(?:[\\s-][A-Z][a-z]+){1,2}';
export const LEADERSHIP_SECTION_RE = new RegExp(
  `${PERSON}\\s*[,–—-]?\\s*${TITLE}|${TITLE}\\s*[:,–—-]?\\s*${PERSON}`,
  'gu',
);

/** Where on a governance page the people who own lending are listed. */
const LENDING_PEOPLE_RE =
  /management board|supervisory board|SME|small and medium|business banking|corporate banking|მენეჯმენტ|სამეთვალყურეო|მცირე და საშუალო|ბიზნეს/iu;

/** Reads one part of a page and logs it, with the page's opening kept on the row. */
async function readPagePart(
  run: RoleSearchRun,
  url: string,
  from: number,
): Promise<{ readonly content: string; readonly nextFrom: number | null }> {
  await charge(run);
  const readAt = Date.now();
  const fetched = (await fetchPage(url, from, LEADERSHIP_SECTION_RE)) as {
    content?: unknown;
    next_from_character?: unknown;
    read_from_character?: unknown;
  };
  const content = typeof fetched?.content === 'string' ? fetched.content : '';
  const head = content.trim().slice(0, PAGE_SAMPLE_CHARS);
  const chars = content.trim().length;
  // The tester's 07:53Z: which part of the page this read covered.
  const at = typeof fetched?.read_from_character === 'number' ? fetched.read_from_character : from;
  logRoleCall(
    run,
    'fetch_page:role',
    { url, from: at, chars },
    { url, from: at, chars, head },
    readAt,
    head,
  );
  const next = fetched?.next_from_character;
  return { content, nextFrom: typeof next === 'number' ? next : null };
}

/**
 * The tester's 21:12Z retest: the group's page was read (8,000 characters)
 * and still nobody was named. A page is shown 8,000 characters at a time, and
 * a bank's governance page spends its first part on menus, so the people can
 * sit further down. Up to three parts are read; the run is handed the stretch
 * that starts where the board or the lending business is named.
 */
async function readOnePage(run: RoleSearchRun, url: string): Promise<string | null> {
  let text = '';
  let from: number | null = 0;
  for (let part = 0; part < MAX_PAGE_PARTS && from !== null; part += 1) {
    const read = await readPagePart(run, url, from);
    text += read.content;
    from = read.nextFrom;
  }
  return pageText({ content: stretchAboutLendingPeople(text) });
}

/** The page from just before where it names the board or the lending business. */
export function stretchAboutLendingPeople(text: string): string {
  const at = text.search(LENDING_PEOPLE_RE);
  const start = at > PAGE_LEAD_IN_CHARS ? at - PAGE_LEAD_IN_CHARS : 0;
  return text.slice(start, start + MAX_PAGE_CHARS);
}

/** A page about who leads the bank now. */
const LEADERSHIP_PAGE_RE =
  /management[\s_-]*(?:board|team)|leadership|board|governance|about|მენეჯმენტ|ხელმძღვანელ/iu;
/**
 * The tester's 06:35Z retest: TBC's own leadership pages are built by script
 * and read as empty, while its group's annual report names the management
 * board. On the bank's own sites a current annual report is read first.
 */
const ANNUAL_REPORT_RE = /annual[\s_-]*report|წლიური[\s_-]*ანგარიშ/iu;
/** A year in the address; an old one marks an old report. */
const YEAR_IN_URL_RE = /(?<!\d)(20\d{2})(?!\d)/gu;
/** A report from more than this many years back no longer names today's people. */
const MAX_REPORT_AGE_YEARS = 1;
const PDF_RE = /\.pdf(?:$|[?#])/iu;

/** The newest year the address or the title names, or null when they name none. */
function yearOf(page: PageCandidate): number | null {
  const years = [...`${page.url} ${page.title}`.matchAll(YEAR_IN_URL_RE)].map((m) => Number(m[1]));
  return years.length === 0 ? null : Math.max(...years);
}

/**
 * The tester's 22:41Z and 23:51Z retests: the page read was TBC's 2015 annual
 * report both times. Its year sits in the TITLE, not the address, so the first
 * filter never saw it. A page dated more than a year back, by address or
 * title, is dropped; the newest dated page comes first, then a leadership
 * page, then the rest, and a PDF after the web pages.
 */
export function currentPagesFirst(
  pages: readonly PageCandidate[],
  now: Date = new Date(),
  leadershipFirst = false,
): PageCandidate[] {
  const oldest = now.getUTCFullYear() - MAX_REPORT_AGE_YEARS;
  const rank = (page: PageCandidate): number => {
    const words = `${page.url} ${page.title}`;
    if (leadershipFirst && ANNUAL_REPORT_RE.test(words) && yearOf(page) !== null) return -1;
    return (LEADERSHIP_PAGE_RE.test(words) ? 0 : 2) + (PDF_RE.test(page.url) ? 1 : 0);
  };
  const byYear = (a: RankedPage, b: RankedPage): number => (b.year ?? 0) - (a.year ?? 0);
  const byRank = (a: RankedPage, b: RankedPage): number => a.rank - b.rank;
  const [first, second] = leadershipFirst ? [byRank, byYear] : [byYear, byRank];
  return pages
    .map((page, at) => ({ page, at, year: yearOf(page), rank: rank(page) }))
    .filter((entry) => entry.year === null || entry.year >= oldest)
    .sort((a, b) => first(a, b) || second(a, b) || a.at - b.at)
    .map((entry) => entry.page);
}

/** A candidate with what orders it. */
interface RankedPage {
  readonly page: PageCandidate;
  readonly at: number;
  readonly year: number | null;
  readonly rank: number;
}

/**
 * The tester's 05:12Z retest (1/3): two runs read a stock site dated 2026
 * ahead of the group's own 2025 annual report, then would not name anybody
 * the bank's own pages had not shown. The bank's own current pages are read
 * first, its leadership pages and reports ahead of a results deck; another
 * site's only after them, newest first.
 */
export function ownSitesFirst(
  own: readonly PageCandidate[],
  others: readonly PageCandidate[],
  now: Date = new Date(),
): PageCandidate[] {
  const ownUrls = new Set(own.map((page) => page.url));
  const unique = (pages: readonly PageCandidate[]): PageCandidate[] => [
    ...new Map(pages.map((page) => [page.url, page])).values(),
  ];
  return [
    ...currentPagesFirst(unique(own), now, true),
    ...currentPagesFirst(unique(others.filter((page) => !ownUrls.has(page.url))), now),
  ];
}

/** Search the bank's own sites for its management page, then read pages until one has text. */
async function findAndReadManagementPage(
  run: RoleSearchRun,
  queries: RoleQueries,
): Promise<ManagementPage | null> {
  const [news, ...ownSites] = await Promise.all([
    searchManagementPage(run, queries.managementNews),
    ...queries.managementPages.map((q) => searchManagementPage(run, q)),
  ]);
  // The tester's 23:51Z retest: the newer sources (a results deck, a news
  // article on TBC strengthening its management team) were found by the
  // searches but never read, because only the bank's own sites were read.
  const own = [
    ...ownSites.flatMap((result) => candidatesFrom(result, queries.institution.sites)),
    ...candidatesFrom(news, queries.institution.sites),
  ];
  const urls = ownSitesFirst(own, candidatesFrom(news, null))
    .slice(0, MAX_PAGES_READ)
    .map((page) => page.url);
  for (const url of urls) {
    const text = await readOnePage(run, url);
    if (text !== null) return { url, text };
  }
  return null;
}

/** Both role queries at once; never throws, a failed half comes back with a null result. */
export async function runRoleSearch(
  run: RoleSearchRun,
  queries: RoleQueries,
): Promise<RoleSearchFinds> {
  const [en, ka, managementPage] = await Promise.all([
    searchOneRole(run, queries.en),
    searchOneRole(run, queries.ka),
    withinBudget(
      findAndReadManagementPage(run, queries),
      queries.institution.en,
      MANAGEMENT_PAGE_BUDGET_MS,
    ),
  ]);
  return { queries, results: [en, ka], managementPage };
}

function clip(text: string): string {
  return text.length > MAX_SECTION_CHARS_PER_QUERY
    ? `${text.slice(0, MAX_SECTION_CHARS_PER_QUERY)}…`
    : text;
}

/** The finds as a prompt section; empty when neither query brought anything back. */
export function buildRoleSearchSection(finds: RoleSearchFinds): string {
  const landed = finds.results.filter((found) => found.result !== null);
  if (landed.length === 0 && finds.managementPage === null) return '';
  const parts = [
    '\n\n## როლით ძიება — უკვე შესრულებულია',
    `მიზანი ${finds.queries.institution.en}-ში სესხს ეხება. სერვერმა ვებში მოძებნა, ვინ ფლობს ` +
      'ამ საქმეს იქ — ბიზნეს-დაკრედიტების ხელმძღვანელი. პირველივე პასუხში, ვინმესთვის რამის ' +
      'კითხვამდე, დაასახელე ეს როლი და ქვემოთ ნაპოვნი ორი-სამი ამჟამინდელი ადამიანი, თითოეული ' +
      'თავისი წყაროს ბმულით. მხოლოდ ამის შემდეგ — გზა მათამდე.',
  ];
  if (finds.managementPage !== null) {
    parts.push(
      `\n### ბანკის მენეჯმენტზე წაკითხული გვერდი: ${finds.managementPage.url}\n` +
        'ეს გვერდი სერვერმა წაიკითხა — აქ დასახელებული ადამიანი და მისი თანამდებობა შეგიძლია ' +
        'დაასახელო ამ ბმულით. თუ ბიზნეს-დაკრედიტებას (SME/ბიზნეს ბანკინგს) კონკრეტული წევრი ' +
        'ხელმძღვანელობს, ის დაასახელე. თუ ის წასულია ან ვერ ჩანს, დაასახელე იმავე გვერდიდან ' +
        'შემდეგი ამჟამინდელი ადამიანი ზემოთ (მაგ. ბანკის აღმასრულებელი დირექტორი) — არასოდეს ' +
        'მხოლოდ წასული.\n' +
        finds.managementPage.text,
    );
  }
  for (const found of landed) {
    parts.push(`\n### ${found.query}\n${clip(JSON.stringify(found.result))}`);
  }
  return parts.join('\n');
}
