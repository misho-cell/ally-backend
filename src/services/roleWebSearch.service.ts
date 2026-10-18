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
  /** The bank's own site, where its management page lives. */
  readonly site: string;
}

/** The lenders owners ask about; the stems catch „თიბისიში", „ბანკის" and the rest. */
const LENDERS: readonly Institution[] = [
  {
    en: 'TBC Bank',
    ka: 'თიბისი ბანკი',
    spellings: /\bTBC\b|თიბისი|ტიბისი/iu,
    site: 'tbcbank.ge',
  },
  {
    en: 'Bank of Georgia',
    ka: 'საქართველოს ბანკი',
    spellings: /\bBank of Georgia\b|\bBOG\b|საქართველოს ბანკ/iu,
    site: 'bankofgeorgia.ge',
  },
  {
    en: 'Liberty Bank',
    ka: 'ლიბერთი ბანკი',
    spellings: /\bLiberty Bank\b|ლიბერთი/iu,
    site: 'libertybank.ge',
  },
  {
    en: 'Basisbank',
    ka: 'ბაზისბანკი',
    spellings: /\bBasis\s?bank\b|ბაზისბანკ/iu,
    site: 'basisbank.ge',
  },
  {
    en: 'ProCredit Bank',
    ka: 'პროკრედიტ ბანკი',
    spellings: /\bProCredit\b|პროკრედიტ/iu,
    site: 'procreditbank.ge',
  },
  {
    en: 'Credo Bank',
    ka: 'კრედო ბანკი',
    spellings: /\bCredo\b|კრედო/iu,
    site: 'credobank.ge',
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
  /** Finds the management page on the bank's own site. */
  readonly managementPage: string;
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
    managementPage: `${institution.en} management board site:${institution.site}`,
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
function withinBudget<T>(work: Promise<T>, query: string): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ROLE_SEARCH_BUDGET_MS);
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

/** The first result that lives on the bank's own site. */
export function firstUrlOnSite(found: unknown, site: string): string | null {
  if (found === null || typeof found !== 'object') return null;
  const rows = (found as { results?: unknown }).results;
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    const url = (row as { url?: unknown } | null)?.url;
    if (typeof url !== 'string') continue;
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === site || host.endsWith(`.${site}`)) return url;
    } catch {
      continue;
    }
  }
  return null;
}

/** The page text a fetch returned, or null when it brought none. */
function pageText(fetched: unknown): string | null {
  const content = (fetched as { content?: unknown } | null)?.content;
  return typeof content === 'string' && content.trim() !== '' ? content : null;
}

/** Search the bank's own site for its management page, then read it. */
async function findAndReadManagementPage(
  run: RoleSearchRun,
  queries: RoleQueries,
): Promise<ManagementPage | null> {
  await charge(run);
  const startedAt = Date.now();
  const found = await webSearch(queries.managementPage);
  logRoleCall(run, 'web_search:role', { query: queries.managementPage }, found, startedAt);
  const url = firstUrlOnSite(found, queries.institution.site);
  if (url === null) return null;
  await charge(run);
  const readAt = Date.now();
  const fetched = await fetchPage(url);
  logRoleCall(run, 'fetch_page:role', { url }, null, readAt);
  const text = pageText(fetched);
  return text === null ? null : { url, text: text.slice(0, MAX_PAGE_CHARS) };
}

/** Both role queries at once; never throws, a failed half comes back with a null result. */
export async function runRoleSearch(
  run: RoleSearchRun,
  queries: RoleQueries,
): Promise<RoleSearchFinds> {
  const [en, ka, managementPage] = await Promise.all([
    searchOneRole(run, queries.en),
    searchOneRole(run, queries.ka),
    withinBudget(findAndReadManagementPage(run, queries), queries.managementPage),
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
