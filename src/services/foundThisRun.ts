/**
 * Misho, 3 Nov („ლიმიტების თემაზე ყველაფერი გააკეთე"): checking what this run
 * has just found is the route to its answer, not a new search. Examples 3, 4, 5
 * and 7: the web or the company base found a firm, and reading its page, or
 * looking in the network for who knows it, was refused by the search budget —
 * so the firm stayed „unconfirmed" or fell out of the answer.
 *
 * A page read of an address this run's own web results gave, and a network
 * search for a name this run's web results or company base gave, are not
 * counted. Each has a cap, so a run cannot read or search without end.
 */
export const FREE_PAGE_READS_PER_RUN = 6;
export const FREE_NAME_CHECKS_PER_RUN = 8;
const MIN_NAME_CHARS = 3;
const URL_RE = /https?:\/\/[^\s"'<>\\]+/gu;
const PAGE_READ_TOOL = 'fetch_page';
const NAME_CHECK_TOOLS: ReadonlySet<string> = new Set([
  'search_by_tag',
  'search_second_degree',
  'search_roster',
  'find_warm_path',
]);

interface RunFinds {
  readonly urls: Set<string>;
  readonly names: Set<string>;
  freeReads: number;
  freeChecks: number;
}

const finds = new Map<string, RunFinds>();

function findsOf(runId: string): RunFinds {
  const known = finds.get(runId);
  if (known !== undefined) return known;
  const fresh: RunFinds = { urls: new Set(), names: new Set(), freeReads: 0, freeChecks: 0 };
  finds.set(runId, fresh);
  return fresh;
}

function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function normalizedUrl(url: string): string {
  return url
    .replace(/[).,;]+$/u, '')
    .replace(/\/+$/u, '')
    .toLowerCase();
}

/** Every address in a web result, kept as this run's own finds. */
export function noteFoundUrls(runId: string | undefined, result: unknown): void {
  if (runId === undefined) return;
  const text = JSON.stringify(result ?? '');
  for (const url of text.match(URL_RE) ?? []) findsOf(runId).urls.add(normalizedUrl(url));
}

/** Names of firms or people this run found on the web or in the company base. */
export function noteFoundNames(runId: string | undefined, names: readonly string[]): void {
  if (runId === undefined) return;
  for (const name of names) {
    const n = normalizedName(name);
    if (n.length >= MIN_NAME_CHARS) findsOf(runId).names.add(n);
  }
}

/** The firm names a company-base answer lists. */
export function companyNamesIn(result: unknown): string[] {
  const companies = (result as { companies?: unknown } | null)?.companies;
  if (!Array.isArray(companies)) return [];
  return companies.flatMap((company: unknown) => {
    const name = (company as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? [name] : [];
  });
}

function queryOf(input: Readonly<Record<string, unknown>>): string {
  for (const key of ['tag_query', 'query', 'name_query', 'target_phone']) {
    const value = input[key];
    if (typeof value === 'string' && value.trim() !== '') return normalizedName(value);
  }
  return '';
}

function namesAFind(query: string, names: ReadonlySet<string>): boolean {
  if (query.length < MIN_NAME_CHARS) return false;
  for (const name of names) if (query.includes(name) || name.includes(query)) return true;
  return false;
}

/**
 * Is this call a check of something this run found — and still within its free
 * allowance? Counts the allowance when it is.
 */
export function isFreeCheckOfAFind(
  runId: string | undefined,
  tool: string,
  input: Readonly<Record<string, unknown>>,
): boolean {
  if (runId === undefined) return false;
  const run = finds.get(runId);
  if (run === undefined) return false;
  if (tool === PAGE_READ_TOOL) {
    const url = input['url'];
    if (typeof url !== 'string' || run.freeReads >= FREE_PAGE_READS_PER_RUN) return false;
    if (!run.urls.has(normalizedUrl(url))) return false;
    run.freeReads += 1;
    return true;
  }
  if (!NAME_CHECK_TOOLS.has(tool) || run.freeChecks >= FREE_NAME_CHECKS_PER_RUN) return false;
  if (!namesAFind(queryOf(input), run.names)) return false;
  run.freeChecks += 1;
  return true;
}

/** Forgets a run's finds. */
export function forgetFinds(runId: string): void {
  finds.delete(runId);
}
