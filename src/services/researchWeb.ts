import { recordFixedUsage } from './costLedger.service';
import { FarDepth, farMembersHolding } from './farCircles.service';
import { findWaysIn, WayIn } from './openingSearch.service';
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
/** The companies named from the results, each looked for in the network. */
const MAX_COMPANIES = 12;
/** What each result says, enough to tell whether the firm does this. */
const SNIPPET_CHARS = 220;
const LATIN_RE = /^[\p{Script=Latin}\d\s-]+$/u;
const CYRILLIC_RE = /^[\p{Script=Cyrillic}\d\s-]+$/u;

export interface WebLevelRequest {
  readonly userId: string;
  readonly threadId: number;
  readonly words: string;
  readonly ownerLine: string;
  readonly meanings: WordMeanings;
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
      .map((word) => (meanings.get(word) ?? []).find((alt) => re.test(alt)) ?? '')
      .filter((alt) => alt !== '')
      .join(' ');
  const queries = [words.trim(), inScript(LATIN_RE), inScript(CYRILLIC_RE)];
  return [...new Set(queries.filter((q) => q !== ''))].slice(0, MAX_WEB_QUERIES);
}

function hitsOf(result: object): WebHit[] {
  const rows = (result as { results?: unknown }).results;
  return Array.isArray(rows) ? (rows as WebHit[]) : [];
}

/** Every query's results, once each, every search charged as the one it is. */
async function searchTheWeb(
  request: WebLevelRequest,
  queries: readonly string[],
): Promise<WebHit[]> {
  const seen = new Set<string>();
  const hits: WebHit[] = [];
  for (const q of queries) {
    await recordFixedUsage({
      userId: request.userId,
      kind: 'web_search',
      ...(await webSearchLedger()),
      threadId: request.threadId,
    }).catch(() => {});
    for (const hit of hitsOf(await webSearch(q))) {
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

/** The web level's result: what the web says, the companies, and the owner's people at them. */
export async function webLevel(request: WebLevelRequest): Promise<object> {
  const hits = await searchTheWeb(request, webQueries(request.words, request.meanings));
  const origin = { userId: request.userId, threadId: request.threadId };
  const companies = await wayInNamesFrom({ results: hits }, MAX_COMPANIES, origin);
  if (companies.length === 0) return { web_results: hits, companies: [] };
  const own = await findWaysIn(request.userId, companies, { threadId: request.threadId });
  const names = companies.join(' ');
  const [second, further] = [
    await searchSecondDegree(request.userId, names, request.ownerLine),
    await farMembersHolding(Number(request.userId), names, undefined, undefined, FarDepth.Labels),
  ];
  return {
    web_results: hits,
    companies: companies.map((name) => ({ name, owner_contact_there: wayInLine(own.get(name)) })),
    people_saved_under_these_companies: { second_circle: second, further_out: further },
  };
}
