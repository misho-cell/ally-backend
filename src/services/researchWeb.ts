import { recordFixedUsage } from './costLedger.service';
import { withoutPublicContacts } from './publicContacts';
import { FarDepth, farMembersHolding } from './farCircles.service';
import { findWaysIn, firmInTheOtherScript, WayIn } from './openingSearch.service';
import {
  FirmPerson,
  firmPeopleThroughContacts,
  firmSpellings,
  namedPeopleThroughContacts,
  ThroughAContact,
} from './researchBridges';
import { georgianStem } from './tools/georgianStem';
import { searchSecondDegree } from './tools/searchSecondDegree';
import { WordMeanings } from './tools/transliterate';
import { fetchPage, webSearch } from './tools/webSearch';
import { pageFetchLedger, webSearchLedger } from './tools/webSearchProvider';
import { wayInNamesFrom, wayInNamesFromAll } from './wayInNames.service';

/**
 * Misho, 16 Nov: „the detailed search should use the web too — find the many
 * companies that do this, then look for the owner's people at each". Misho,
 * 17 Nov, after the tester's second round: the long answer may take up to half
 * an hour; search the web much more and use the time to find the way in.
 *
 * This level searches the web in the request's languages and for each related
 * trade, names the companies from every result, and for each company: looks
 * for the owner's people (own contacts, people the owner's contacts hold whom
 * anyone tied to the firm, the second circle and further out), reads its page
 * to see whether it says it does this, and looks up who heads it — matched in
 * the owner's own contacts and in their contacts' phonebooks.
 */

/** The web searched with the request's words, then the same meaning in other words and scripts. */
const MAX_WEB_QUERIES = 6;
/** Each related trade, in its own words and one other script. */
const MAX_RELATED_TRADES_SEARCHED = 4;
const QUERIES_PER_RELATED_TRADE = 2;
/** The companies named from the results, each looked for in the network. */
const MAX_COMPANIES = 20;
/** What each result says, enough to tell whether the firm does this. */
const SNIPPET_CHARS = 220;
/** The firms whose head is looked up, the ones the owner has nobody at first. */
const MAX_HEAD_LOOKUPS = 12;
/** The names read from a head search's titles. */
const MAX_HEADS = 3;
/** The firms whose own page is read. */
const MAX_PAGES_READ = 12;
/** What is quoted from a page around a word of the request. */
const PAGE_EXCERPT_CHARS = 160;
/** How many firms are worked on at once. */
const FIRMS_AT_ONCE = 4;
/** What a head search adds to the firm's name, in the languages pages are written in. */
const HEAD_SEARCH_WORDS = 'CEO director founder დირექტორი დამფუძნებელი';
const LATIN_RE = /^[\p{Script=Latin}\d\s-]+$/u;
const CYRILLIC_RE = /^[\p{Script=Cyrillic}\d\s-]+$/u;
const GEORGIAN_RE = /^[\p{Script=Georgian}\d\s-]+$/u;
const VOWELS_RE = /[aeiouy]/gu;
const NOT_LETTERS_RE = /[^a-z]/gu;
const MIN_STEM_LETTERS = 4;
const STEM_SHARE = 0.6;

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

/** One alternative per word in the wanted script — the `nth` one the meanings give. */
function inScript(words: string, meanings: WordMeanings, re: RegExp, nth: number): string {
  return words
    .split(/\s+/u)
    .map(
      (word) => (meanings.get(word.toLowerCase()) ?? []).filter((alt) => re.test(alt))[nth] ?? '',
    )
    .filter((alt) => alt !== '')
    .join(' ');
}

/**
 * The request's words, then the same words as other languages say them, then
 * the same meaning in other words (the meanings' second choices).
 */
export function webQueries(words: string, meanings: WordMeanings): string[] {
  const queries = [
    words.trim(),
    inScript(words, meanings, LATIN_RE, 0),
    inScript(words, meanings, CYRILLIC_RE, 0),
    inScript(words, meanings, GEORGIAN_RE, 0),
    inScript(words, meanings, LATIN_RE, 1),
    inScript(words, meanings, GEORGIAN_RE, 1),
  ];
  return [...new Set(queries.filter((q) => q !== ''))].slice(0, MAX_WEB_QUERIES);
}

/** The request's own searches, then each related trade in its own words and one other script. */
export function allWebQueries(request: WebLevelRequest): string[] {
  const own = webQueries(request.words, request.meanings);
  const related = (request.related ?? [])
    .slice(0, MAX_RELATED_TRADES_SEARCHED)
    .flatMap((trade) => webQueries(trade, request.meanings).slice(0, QUERIES_PER_RELATED_TRADE));
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
  return hitsOf(withoutPublicContacts(await webSearch(q)) as object);
}

/** One page read, charged as the one it is. */
async function chargedPage(request: WebLevelRequest, url: string): Promise<string> {
  await recordFixedUsage({
    userId: request.userId,
    kind: 'web_search',
    ...(await pageFetchLedger()),
    threadId: request.threadId,
  }).catch(() => {});
  const page = withoutPublicContacts(await fetchPage(url)) as { content?: unknown };
  return typeof page.content === 'string' ? page.content : '';
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

function textOf(hit: WebHit): string {
  const title = typeof hit.title === 'string' ? hit.title : '';
  const snippet = typeof hit.snippet === 'string' ? hit.snippet : '';
  return `${title} ${snippet}`.toLocaleLowerCase();
}

/** A firm's name in both alphabets, lower case. */
function firmForms(firm: string): string[] {
  return [firm, firmInTheOtherScript(firm)]
    .map((f) => f.trim().toLocaleLowerCase())
    .filter((f) => f !== '');
}

/** The first result that names the firm: where its page is. */
function hitNaming(hits: readonly WebHit[], firm: string): WebHit | undefined {
  const forms = firmForms(firm);
  return hits.find((hit) => forms.some((form) => textOf(hit).includes(form)));
}

/** A Latin name's consonants: „brandhand" and „brendhendi" are one name. */
function skeleton(latin: string): string {
  return latin.toLowerCase().replace(VOWELS_RE, '').replace(NOT_LETTERS_RE, '');
}

/**
 * The site's own name when it is the firm's: „ბრენდჰენდი" lives at
 * brandhand.ge, and members label its people „brandhand", which no
 * letter-by-letter spelling of the Georgian reaches. A platform's host
 * (a directory, a social site) is not the firm's and is left out.
 */
export function siteNameOf(url: unknown, firm: string): string {
  if (typeof url !== 'string') return '';
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./u, '');
  } catch {
    return '';
  }
  const label = host.split('.')[0] ?? '';
  const latin = [firm, firmInTheOtherScript(firm)].find((f) => LATIN_RE.test(f)) ?? '';
  if (label === '' || latin === '') return '';
  const site = skeleton(label);
  return site !== '' && site === skeleton(latin) ? label : '';
}

interface CompanyHead {
  readonly name: string;
  readonly owner_contact: string;
  readonly through_your_contacts?: readonly ThroughAContact[];
}

/**
 * The tester's cases, 16 and 17 Nov: a found firm's head was the way in — her
 * own contact on the 16th, a friend's contact on the 17th — and the web names
 * him when the firm's head is searched. Only results that name the firm are
 * read (the 17th's head searches returned other firms' chiefs); the firm's
 * name goes out, never a person's.
 */
async function headNamesOf(
  request: WebLevelRequest,
  company: string,
  site: readonly string[],
): Promise<string[]> {
  // The site's own name too: pages about „ბრენდჰენდი" call it Brandhand.
  const named = [company, ...site].join(' ');
  const hits = await chargedSearch(request, `${named} ${HEAD_SEARCH_WORDS}`);
  const forms = [...firmForms(company), ...site];
  const aboutTheFirm = hits.filter((hit) => forms.some((form) => textOf(hit).includes(form)));
  if (aboutTheFirm.length === 0) return [];
  const origin = { userId: request.userId, threadId: request.threadId };
  const names = await wayInNamesFrom({ results: aboutTheFirm }, MAX_HEADS, origin);
  return names.filter((name) => {
    const lower = name.toLocaleLowerCase();
    return !forms.some((form) => form.includes(lower) || lower.includes(form));
  });
}

/** Each head matched as a person: in the owner's own contacts, then in their contacts' phonebooks. */
async function headsMatched(
  request: WebLevelRequest,
  namesOf: ReadonlyMap<string, readonly string[]>,
  siteNames: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, CompanyHead[]>> {
  const all = [...new Set([...namesOf.values()].flat())];
  if (all.length === 0) return new Map();
  // Each head with the spellings of the firm the web names them at, to tell them from namesakes.
  const firmOf = new Map<string, string[]>();
  for (const [company, names] of namesOf) {
    for (const name of names) firmOf.set(name, firmSpellings(company, siteNames.get(company)));
  }
  const [own, through] = await Promise.all([
    findWaysIn(request.userId, all, { threadId: request.threadId }, undefined, {
      everyNameIsAPerson: true,
    }),
    namedPeopleThroughContacts(request.userId, firmOf).catch(
      () => new Map<string, ThroughAContact[]>(),
    ),
  ]);
  const heads = new Map<string, CompanyHead[]>();
  for (const [company, names] of namesOf) {
    heads.set(
      company,
      names.map((name) => {
        const via = through.get(name) ?? [];
        return {
          name,
          owner_contact: wayInLine(own.get(name)),
          ...(via.length > 0 ? { through_your_contacts: via } : {}),
        };
      }),
    );
  }
  return heads;
}

/** Work through the firms a few at a time. */
async function inBatches<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let at = 0; at < items.length; at += FIRMS_AT_ONCE) {
    out.push(...(await Promise.all(items.slice(at, at + FIRMS_AT_ONCE).map(work))));
  }
  return out;
}

/** The heads of the firms, the ones the owner has nobody at first. */
async function headsOfFirms(
  request: WebLevelRequest,
  companies: readonly string[],
  own: ReadonlyMap<string, WayIn>,
  siteNames: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, CompanyHead[]>> {
  const nobodyFirst = [
    ...companies.filter((c) => own.get(c)?.kind !== 'first_circle'),
    ...companies.filter((c) => own.get(c)?.kind === 'first_circle'),
  ].slice(0, MAX_HEAD_LOOKUPS);
  const found = await inBatches(nobodyFirst, async (company) => {
    const site = siteNames.get(company) ?? [];
    const names = await headNamesOf(request, company, site).catch((): string[] => []);
    return [company, names] as const;
  });
  const namesOf = new Map(found.filter(([, names]) => names.length > 0));
  return headsMatched(request, namesOf, siteNames);
}

/** A word cut to the part its forms share: Georgian by its endings, others by length. */
function stemOf(word: string): string {
  const lower = word.toLocaleLowerCase();
  const stemmed = georgianStem(lower);
  if (stemmed !== lower) return stemmed;
  const letters = [...lower];
  const keep = Math.max(MIN_STEM_LETTERS, Math.ceil(letters.length * STEM_SHARE));
  return letters.slice(0, keep).join('');
}

/** The words a page is read for: the request's, their meanings and the related trades — as stems. */
export function pageWords(request: WebLevelRequest): string[] {
  const words = [request.words, ...(request.related ?? [])]
    .join(' ')
    .split(/\s+/u)
    .filter((w) => w !== '');
  const meanings = words.flatMap((w) => request.meanings.get(w.toLowerCase()) ?? []);
  const stems = [...words, ...meanings].map(stemOf);
  return [...new Set(stems.filter((s) => [...s].length >= MIN_STEM_LETTERS))];
}

export interface PageReading {
  readonly url: string;
  readonly mentions: readonly string[];
  readonly excerpt?: string;
}

/**
 * The tester's case, 17 Nov: on the 16th the answer said a firm makes branded
 * thermoses, on the 17th that its page does not show them — each from a
 * 220-character snippet. The firm's own page is read and the request's words
 * looked for on it.
 */
export function readingOf(url: string, page: string, words: readonly string[]): PageReading {
  const lower = page.toLocaleLowerCase();
  const mentions = words.filter((w) => lower.includes(w));
  if (mentions.length === 0) return { url, mentions };
  const at = lower.indexOf(mentions[0] ?? '');
  const from = Math.max(0, at - PAGE_EXCERPT_CHARS / 2);
  const excerpt = page
    .slice(from, from + PAGE_EXCERPT_CHARS)
    .replace(/\s+/gu, ' ')
    .trim();
  return { url, mentions, excerpt };
}

async function pagesOfFirms(
  request: WebLevelRequest,
  urls: ReadonlyMap<string, string>,
): Promise<Map<string, PageReading>> {
  const words = pageWords(request);
  const firms = [...urls].slice(0, MAX_PAGES_READ);
  const read = await inBatches(firms, async ([firm, url]) => {
    const page = await chargedPage(request, url).catch(() => '');
    return [firm, page === '' ? null : readingOf(url, page, words)] as const;
  });
  const pages = new Map<string, PageReading>();
  for (const [firm, reading] of read) {
    if (reading !== null) pages.set(firm, reading);
  }
  return pages;
}

interface CompanyFinding {
  readonly name: string;
  readonly owner_contact_there: string;
  readonly people_your_contacts_hold_there?: readonly FirmPerson[];
  readonly its_page?: PageReading;
  readonly heads_on_the_web?: readonly CompanyHead[];
}

/** Each company's page and its own site name, from the first result that names it. */
function sitesOf(
  hits: readonly WebHit[],
  companies: readonly string[],
): { urls: Map<string, string>; siteNames: Map<string, string[]> } {
  const urls = new Map<string, string>();
  const siteNames = new Map<string, string[]>();
  for (const company of companies) {
    // The probe, 17 Nov: the first result naming „ბრენდჰენდი" was a directory, so its
    // site name was never learnt. Any result on the firm's own site gives it, and its page.
    const own = hits.find((hit) => siteNameOf(hit.url, company) !== '');
    const url = (own ?? hitNaming(hits, company))?.url;
    if (typeof url === 'string') urls.set(company, url);
    const site = siteNameOf(own?.url, company);
    siteNames.set(company, site === '' ? [] : [site]);
  }
  return { urls, siteNames };
}

/**
 * The web level in the log line: results, companies, pages read and saying
 * it, heads found and matched, people through contacts — so ops can see which
 * step found the way in, or which found nothing.
 */
export function webCounts(result: object): string {
  const { companies, web_results: hits } = result as {
    companies?: readonly CompanyFinding[];
    web_results?: readonly unknown[];
  };
  const firms = companies ?? [];
  const heads = firms.flatMap((c) => c.heads_on_the_web ?? []);
  const count = (pick: (c: CompanyFinding) => boolean): number => firms.filter(pick).length;
  return [
    `results ${hits?.length ?? 0}`,
    `companies ${firms.length}`,
    `own contact there ${count((c) => c.owner_contact_there.startsWith('the owner'))}`,
    `through contacts ${count((c) => (c.people_your_contacts_hold_there ?? []).length > 0)}`,
    `pages read ${count((c) => c.its_page !== undefined)}`,
    `pages saying it ${count((c) => (c.its_page?.mentions ?? []).length > 0)}`,
    `heads ${heads.length}`,
    `heads reachable ${heads.filter((h) => h.owner_contact.startsWith('the owner') || (h.through_your_contacts ?? []).length > 0).length}`,
  ].join(', ');
}

/** The web level's result: what the web says, the companies, and the owner's people at them. */
export async function webLevel(request: WebLevelRequest): Promise<object> {
  const hits = await searchTheWeb(request, allWebQueries(request));
  const origin = { userId: request.userId, threadId: request.threadId };
  const companies = await wayInNamesFromAll({ results: hits }, MAX_COMPANIES, origin);
  if (companies.length === 0) return { web_results: hits, companies: [] };
  const { urls, siteNames } = sitesOf(hits, companies);
  const own = await findWaysIn(request.userId, companies, { threadId: request.threadId });
  // Ops, 16 Nov: members save a firm as it sounds, in the other alphabet („brendhendi").
  const names = [
    ...new Set([...companies, ...companies.map(firmInTheOtherScript).filter((n) => n !== '')]),
  ].join(' ');
  const [second, further, through, pages, heads] = [
    await searchSecondDegree(request.userId, names, request.ownerLine),
    await farMembersHolding(Number(request.userId), names, undefined, undefined, FarDepth.Labels),
    await firmPeopleThroughContacts(request.userId, siteNames).catch(
      () => new Map<string, FirmPerson[]>(),
    ),
    await pagesOfFirms(request, urls),
    await headsOfFirms(request, companies, own, siteNames),
  ];
  const found: CompanyFinding[] = companies.map((name) => ({
    name,
    owner_contact_there: wayInLine(own.get(name)),
    ...(through.has(name) ? { people_your_contacts_hold_there: through.get(name) } : {}),
    ...(pages.has(name) ? { its_page: pages.get(name) } : {}),
    ...(heads.has(name) ? { heads_on_the_web: heads.get(name) } : {}),
  }));
  // The companies first: the model reads this cut at a length, and the raw results matter least.
  return {
    companies: found,
    people_saved_under_these_companies: { second_circle: second, further_out: further },
    web_results: hits,
  };
}
