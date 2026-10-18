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
/** The management page may need a second read when the first comes back empty. */
const MANAGEMENT_PAGE_BUDGET_MS = 12_000;

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
    managementPages: institution.sites.map(
      (site) => `${institution.en} management board site:${site}`,
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
    resultSample: webTitles(result),
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

/** Every result that lives on one of the bank's own sites, in order, without repeats. */
export function urlsOnSites(found: unknown, sites: readonly string[]): string[] {
  if (found === null || typeof found !== 'object') return [];
  const rows = (found as { results?: unknown }).results;
  if (!Array.isArray(rows)) return [];
  const urls = rows
    .map((row) => (row as { url?: unknown } | null)?.url)
    .filter((url): url is string => typeof url === 'string' && isOnSite(url, sites));
  return [...new Set(urls)];
}

/**
 * Fewer characters than this is a page with nothing on it. The tester's
 * 20:27Z retest: tbcbank.ge's governance page came back with 3 characters,
 * which counted as text, so the next page was never read.
 */
export const MIN_PAGE_CHARS = 200;

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

/** Reads one page; its text, or null when it came back empty. */
async function readOnePage(run: RoleSearchRun, url: string): Promise<string | null> {
  await charge(run);
  const readAt = Date.now();
  const fetched = await fetchPage(url);
  const content = (fetched as { content?: unknown } | null)?.content;
  const rawChars = typeof content === 'string' ? content.trim().length : 0;
  const text = pageText(fetched);
  logRoleCall(run, 'fetch_page:role', { url, chars: rawChars }, null, readAt);
  return text;
}

/** Search the bank's own sites for its management page, then read pages until one has text. */
async function findAndReadManagementPage(
  run: RoleSearchRun,
  queries: RoleQueries,
): Promise<ManagementPage | null> {
  const found = await Promise.all(queries.managementPages.map((q) => searchManagementPage(run, q)));
  const urls = [
    ...new Set(found.flatMap((result) => urlsOnSites(result, queries.institution.sites))),
  ].slice(0, MAX_PAGES_READ);
  for (const url of urls) {
    const text = await readOnePage(run, url);
    if (text !== null) return { url, text: text.slice(0, MAX_PAGE_CHARS) };
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
      `\n### ბანკის საკუთარი გვერდი, წაკითხული: ${finds.managementPage.url}\n` +
        'ეს გვერდი სერვერმა წაიკითხა — აქ დასახელებული ადამიანი და მისი თანამდებობა შეგიძლია ' +
        'დაასახელო ამ ბმულით. თუ ბიზნეს-დაკრედიტებას (SME/ბიზნეს ბანკინგს) კონკრეტული წევრი ' +
        'ხელმძღვანელობს, ის დაასახელე.\n' +
        finds.managementPage.text,
    );
  }
  for (const found of landed) {
    parts.push(`\n### ${found.query}\n${clip(JSON.stringify(found.result))}`);
  }
  return parts.join('\n');
}
