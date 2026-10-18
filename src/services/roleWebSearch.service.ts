import { webSearch } from './tools/webSearch';
import { recordFixedUsage } from './costLedger.service';
import { logToolCall } from './toolCallLog.service';

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
 */

/** A role search on the first answer's path waits this long, and no longer. */
const ROLE_SEARCH_BUDGET_MS = 8_000;

/** The results handed to the model, per query. */
const MAX_SECTION_CHARS_PER_QUERY = 3_000;

export interface Institution {
  /** How the web knows it, in English. */
  readonly en: string;
  /** How a Georgian page writes it. */
  readonly ka: string;
  /** Every spelling an owner types; matched case-insensitively as written. */
  readonly spellings: RegExp;
}

/** The lenders owners ask about; the stems catch „თიბისიში", „ბანკის" and the rest. */
const LENDERS: readonly Institution[] = [
  { en: 'TBC Bank', ka: 'თიბისი ბანკი', spellings: /\bTBC\b|თიბისი|ტიბისი/iu },
  {
    en: 'Bank of Georgia',
    ka: 'საქართველოს ბანკი',
    spellings: /\bBank of Georgia\b|\bBOG\b|საქართველოს ბანკ/iu,
  },
  { en: 'Liberty Bank', ka: 'ლიბერთი ბანკი', spellings: /\bLiberty Bank\b|ლიბერთი/iu },
  { en: 'Basisbank', ka: 'ბაზისბანკი', spellings: /\bBasis\s?bank\b|ბაზისბანკ/iu },
  { en: 'ProCredit Bank', ka: 'პროკრედიტ ბანკი', spellings: /\bProCredit\b|პროკრედიტ/iu },
  { en: 'Credo Bank', ka: 'კრედო ბანკი', spellings: /\bCredo\b|კრედო/iu },
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
  };
}

export interface RoleSearchResult {
  readonly query: string;
  /** The search tool's own result; null when it failed or ran out of time. */
  readonly result: unknown;
}

export interface RoleSearchFinds {
  readonly queries: RoleQueries;
  readonly results: readonly RoleSearchResult[];
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

/** One role query: charged and logged like the opening web search. */
async function searchOneRole(run: RoleSearchRun, query: string): Promise<RoleSearchResult> {
  await recordFixedUsage({
    userId: run.userId,
    kind: 'web_search',
    provider: 'tavily',
    priceKey: 'tavily.search',
    runId: run.runId,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[role-search] ledger write failed:', (err as Error).message);
  });
  const startedAt = Date.now();
  const result = await withinBudget(webSearch(query), query);
  void logToolCall({
    threadId: run.threadId,
    surface: 'chat',
    runId: run.runId,
    userId: run.userId,
    tool: 'web_search:role',
    input: { query },
    result,
    durationMs: Date.now() - startedAt,
  });
  return { query, result };
}

/** Both role queries at once; never throws, a failed half comes back with a null result. */
export async function runRoleSearch(
  run: RoleSearchRun,
  queries: RoleQueries,
): Promise<RoleSearchFinds> {
  const results = await Promise.all([
    searchOneRole(run, queries.en),
    searchOneRole(run, queries.ka),
  ]);
  return { queries, results };
}

function clip(text: string): string {
  return text.length > MAX_SECTION_CHARS_PER_QUERY
    ? `${text.slice(0, MAX_SECTION_CHARS_PER_QUERY)}…`
    : text;
}

/** The finds as a prompt section; empty when neither query brought anything back. */
export function buildRoleSearchSection(finds: RoleSearchFinds): string {
  const landed = finds.results.filter((found) => found.result !== null);
  if (landed.length === 0) return '';
  const parts = [
    '\n\n## როლით ძიება — უკვე შესრულებულია',
    `მიზანი ${finds.queries.institution.en}-ში სესხს ეხება. სერვერმა ვებში მოძებნა, ვინ ფლობს ` +
      'ამ საქმეს იქ — ბიზნეს-დაკრედიტების ხელმძღვანელი. პირველივე პასუხში, ვინმესთვის რამის ' +
      'კითხვამდე, დაასახელე ეს როლი და ქვემოთ ნაპოვნი ორი-სამი ამჟამინდელი ადამიანი, თითოეული ' +
      'თავისი წყაროს ბმულით. მხოლოდ ამის შემდეგ — გზა მათამდე.',
  ];
  for (const found of landed) {
    parts.push(`\n### ${found.query}\n${clip(JSON.stringify(found.result))}`);
  }
  return parts.join('\n');
}
