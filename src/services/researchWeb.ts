import { recordFixedUsage } from './costLedger.service';
import { FarDepth, farMembersHolding } from './farCircles.service';
import { findWaysIn, firmInTheOtherScript, WayIn } from './openingSearch.service';
import { searchSecondDegree } from './tools/searchSecondDegree';
import { WordMeanings } from './tools/transliterate';
import { webSearch } from './tools/webSearch';
import { webSearchLedger } from './tools/webSearchProvider';
import { wayInNamesFrom } from './wayInNames.service';

/**
 * Misho, 16 Nov: „the detailed search should use the web too — find the many
 * companies that do this, then look for the owner's people at each". The full
 * research had no web at all; the quick answer searched it once and checked
 * one company. This level searches the web in the request's languages, names
 * the companies the results are about, and looks for the owner's people at
 * every one: their own contacts, the second circle and further out.
 */

/** The web searched with the request's words, then with its meanings in two more scripts. */
const MAX_WEB_QUERIES = 3;
/** And with the most likely related trades, one search each. */
const MAX_RELATED_WEB_QUERIES = 2;
/** The companies named from the results, each looked for in the network. */
const MAX_COMPANIES = 12;
/** What each result says, enough to tell whether the firm does this. */
const SNIPPET_CHARS = 220;
/** The firms whose head is looked up: the first ones the owner has nobody at. */
const MAX_HEAD_LOOKUPS = 3;
/** The names read from a head search's titles. */
const MAX_HEADS = 3;
/** What a head search adds to the firm's name, in the languages pages are written in. */
const HEAD_SEARCH_WORDS = 'CEO director founder დირექტორი დამფუძნებელი';
const LATIN_RE = /^[\p{Script=Latin}\d\s-]+$/u;
const CYRILLIC_RE = /^[\p{Script=Cyrillic}\d\s-]+$/u;

export interface WebLevelRequest {
  readonly userId: string;
  readonly threadId: number;
  readonly words: string;
  readonly ownerLine: string;
  readonly meanings: WordMeanings;
  /** The trades who could deliver this (relatedTrades), most likely first. */
  readonly related?: readonly string[];
}

interface WebHit {
  readonly title?: unknown;
  readonly url?: unknown;
  readonly snippet?: unknown;
}

/** The request's words, then the same words as other languages say them (from the meanings). */
export function webQueries(words: string, meanings: WordMeanings): string[] {
  const inScript = (re: RegExp): string =>
    words
      .split(/\s+/u)
      .map((word) => (meanings.get(word.toLowerCase()) ?? []).find((alt) => re.test(alt)) ?? '')
      .filter((alt) => alt !== '')
      .join(' ');
  const queries = [words.trim(), inScript(LATIN_RE), inScript(CYRILLIC_RE)];
  return [...new Set(queries.filter((q) => q !== ''))].slice(0, MAX_WEB_QUERIES);
}

/** The request's own searches, then one for each of the most likely related trades. */
export function allWebQueries(request: WebLevelRequest): string[] {
  const own = webQueries(request.words, request.meanings);
  const related = (request.related ?? []).slice(0, MAX_RELATED_WEB_QUERIES);
  return [...new Set([...own, ...related])];
}

function hitsOf(result: object): WebHit[] {
  const rows = (result as { results?: unknown }).results;
  return Array.isArray(rows) ? (rows as WebHit[]) : [];
}

/** One web search, charged as the one it is. */
async function chargedSearch(request: WebLevelRequest, q: string): Promise<WebHit[]> {
  await recordFixedUsage({
    userId: request.userId,
    kind: 'web_search',
    ...(await webSearchLedger()),
    threadId: request.threadId,
  }).catch(() => {});
  return hitsOf(await webSearch(q));
}

/** Every query's results, once each. */
async function searchTheWeb(
  request: WebLevelRequest,
  queries: readonly string[],
): Promise<WebHit[]> {
  const seen = new Set<string>();
  const hits: WebHit[] = [];
  for (const q of queries) {
    for (const hit of await chargedSearch(request, q)) {
      const key = String(hit.url ?? hit.title ?? '');
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      hits.push({
        title: hit.title,
        url: hit.url,
        snippet: typeof hit.snippet === 'string' ? hit.snippet.slice(0, SNIPPET_CHARS) : undefined,
      });
    }
  }
  return hits;
}

function wayInLine(wayIn: WayIn | undefined): string {
  if (wayIn === undefined || wayIn.kind === 'unchecked') return 'not checked';
  return wayIn.kind === 'first_circle' ? `the owner’s own contact: ${wayIn.who}` : 'none';
}

interface CompanyHead {
  readonly name: string;
  readonly owner_contact: string;
}

/**
 * The tester's case, 16 Nov: a found firm's head was in her own phonebook under
 * his own name only, and the web names him as its head when the firm's head is
 * searched — nobody searched it. The web is asked who heads the firm (its name
 * goes out, never a person's), and each name it gives is matched against the
 * owner's own contacts as a person: first name and surname, never a namesake.
 */
async function headsOf(request: WebLevelRequest, company: string): Promise<CompanyHead[]> {
  const hits = await chargedSearch(request, `${company} ${HEAD_SEARCH_WORDS}`);
  const origin = { userId: request.userId, threadId: request.threadId };
  const firm = company.toLocaleLowerCase();
  const names = (await wayInNamesFrom({ results: hits }, MAX_HEADS, origin)).filter(
    (name) => !firm.includes(name.toLocaleLowerCase()) && !name.toLocaleLowerCase().includes(firm),
  );
  if (names.length === 0) return [];
  const ways = await findWaysIn(request.userId, names, { threadId: request.threadId }, undefined, {
    everyNameIsAPerson: true,
  });
  return names.map((name) => ({ name, owner_contact: wayInLine(ways.get(name)) }));
}

/** The heads of the first few companies the owner has nobody at yet. */
async function headsWhereNobody(
  request: WebLevelRequest,
  companies: readonly string[],
  own: ReadonlyMap<string, WayIn>,
): Promise<Map<string, CompanyHead[]>> {
  const heads = new Map<string, CompanyHead[]>();
  const nobody = companies.filter((c) => own.get(c)?.kind !== 'first_circle');
  for (const company of nobody.slice(0, MAX_HEAD_LOOKUPS)) {
    heads.set(company, await headsOf(request, company).catch(() => []));
  }
  return heads;
}

/** The web level's result: what the web says, the companies, and the owner's people at them. */
export async function webLevel(request: WebLevelRequest): Promise<object> {
  const hits = await searchTheWeb(request, allWebQueries(request));
  const origin = { userId: request.userId, threadId: request.threadId };
  const companies = await wayInNamesFrom({ results: hits }, MAX_COMPANIES, origin);
  if (companies.length === 0) return { web_results: hits, companies: [] };
  const own = await findWaysIn(request.userId, companies, { threadId: request.threadId });
  // Ops, 16 Nov: members save a firm as it sounds, in the other alphabet („brendhendi").
  const names = [
    ...new Set([...companies, ...companies.map(firmInTheOtherScript).filter((n) => n !== '')]),
  ].join(' ');
  const [second, further, heads] = [
    await searchSecondDegree(request.userId, names, request.ownerLine),
    await farMembersHolding(Number(request.userId), names, undefined, undefined, FarDepth.Labels),
    await headsWhereNobody(request, companies, own),
  ];
  return {
    web_results: hits,
    companies: companies.map((name) => ({
      name,
      owner_contact_there: wayInLine(own.get(name)),
      ...(heads.has(name) ? { heads_on_the_web: heads.get(name) } : {}),
    })),
    people_saved_under_these_companies: { second_circle: second, further_out: further },
  };
}
