import { hasGeorgian, georgianToLatin } from './transliterate';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 5;
const SNIPPET_CHARS = 600;

// Tavily's own synthesized `answer` collapses several results into one sentence
// and, on personnel news, garbles exact titles — it turned "will succeed [the
// Deputy CEO in charge of Mass Retail Banking] with effect from 1 March 2025"
// into "is the CEO as of March 1, 2025". We do NOT surface that sentence; the
// model reasons over the verbatim titles/snippets itself (it carries the
// officeholder rule), so a role stated in a source is never silently promoted.
const RESULT_GUIDANCE =
  'These are raw search results. Derive facts only from the snippets below and ' +
  'preserve exact job titles verbatim — never shorten a qualified title (e.g. ' +
  '"Deputy CEO in charge of X") to a broader one (e.g. "CEO"). For a current ' +
  "officeholder, prefer a result marked official:true (the institution's own " +
  'site) and READ that page with fetch_page before naming anyone — a news ' +
  'snippet may be stale or name a former/acting holder. If fetch_page cannot ' +
  'read the page, you may NOT name the officeholder from these snippets — ' +
  'say plainly that the official page could not be read.';

// The institution's own domain outranks any news article on "who currently
// holds this role". Georgian public bodies live under gov.ge; parliament and
// a few others have their own roots.
const OFFICIAL_DOMAIN_RE =
  /(^|\.)gov\.ge$|(^|\.)parliament\.ge$|(^|\.)court\.ge$|(^|\.)nbg\.gov\.ge$|(^|\.)\w+\.gov$/i;

function isOfficialDomain(url: string): boolean {
  try {
    return OFFICIAL_DOMAIN_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// A fetched page's readable text lets the model verify a current officeholder
// off an institution's own roster instead of a stale third-party directory —
// search snippets alone can't carry the actual name. Same rule as search: read
// the page's words verbatim, don't invent or promote a role.
const PAGE_CHARS = 8000;
const PAGE_GUIDANCE =
  "This is the page's own text. Read the answer off it verbatim (exact names and " +
  'titles); if the page does not state it, say so — do not guess or fall back to a ' +
  'name not on the page.';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

interface TavilyExtractResponse {
  results?: { url: string; raw_content?: string }[];
}

// Two prod fabrications (threads 5941/6087) traced to exactly this: Tavily's
// extractor returned NO text for tbilisi.gov.ge pages — even at advanced
// depth — and the model then named an officeholder from a stale search
// snippet. The note must forbid that fallback in so many words.
const NO_TEXT_NOTE =
  'The page returned no readable text. You may NOT name a person or ' +
  'officeholder from search snippets instead — tell the user plainly that ' +
  'the official page could not be read right now.';

// The direct-fetch fallback hits a model-supplied URL from OUR server, so
// private/internal targets must be refused (SSRF). Tavily-side fetches never
// had this concern — their infrastructure did the fetching.
const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|.*\.internal)$|^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)|^(\[?::1\]?|0\.0\.0\.0)$/i;

export function isBlockedFetchHost(hostname: string): boolean {
  return PRIVATE_HOST_RE.test(hostname);
}

/**
 * Last-resort page read when Tavily's extractor comes back empty: plain GET +
 * crude tag strip. Gov pages that defeat the extractor often still carry
 * their roster in plain markup, so even rough text beats an empty answer.
 */
async function fetchRawPageText(url: string): Promise<string> {
  try {
    if (isBlockedFetchHost(new URL(url).hostname)) return '';
  } catch {
    return '';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AllyBot/1.0)' },
    });
    if (!response.ok) return '';
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export async function webSearch(query: string): Promise<object> {
  if (!TAVILY_API_KEY) {
    return { error: 'Web search not configured (TAVILY_API_KEY missing)' };
  }

  // If query contains Georgian script, append transliterated Latin version
  // so search engines can match both scripts (e.g. "მახარაძე makharadze")
  const enrichedQuery = hasGeorgian(query) ? `${query} ${georgianToLatin(query)}` : query;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: enrichedQuery,
        search_depth: 'basic',
        max_results: MAX_RESULTS,
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: `Tavily error ${response.status}: ${body}` };
    }

    const data = (await response.json()) as TavilyResponse;

    return {
      guidance: RESULT_GUIDANCE,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, SNIPPET_CHARS),
        // Institutional/government domains are the authoritative source for
        // current officeholders — news can be stale. When official:true is
        // present, prefer that result and read the page itself (fetch_page)
        // before naming who holds a role.
        ...(isOfficialDomain(r.url) && { official: true }),
      })),
    };
  } catch (err) {
    return { error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch and return the readable text of one page (via Tavily's extract endpoint)
 * so the assistant can read an official roster/page directly rather than relying
 * on search snippets. URL must be http(s); content is truncated.
 */
export async function fetchPage(url: string): Promise<object> {
  if (!TAVILY_API_KEY) {
    return { error: 'Web fetch not configured (TAVILY_API_KEY missing)' };
  }
  const target = (url ?? '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return { error: 'Pass a full http(s) URL.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      // Official/gov pages often defeat the basic extractor ("blocks text" —
      // two officeholder fabrications trace to unreadable tbilisi.gov.ge).
      // Advanced depth renders these pages properly; used only where it matters.
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        urls: [target],
        ...(isOfficialDomain(target) && { extract_depth: 'advanced' }),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: `Tavily extract error ${response.status}: ${body}` };
    }

    const data = (await response.json()) as TavilyExtractResponse;
    const content = data.results?.[0]?.raw_content ?? '';
    if (!content.trim()) {
      // Extractor came back empty — try a plain fetch before giving up.
      const fallback = await fetchRawPageText(target);
      if (fallback) {
        return { url: target, guidance: PAGE_GUIDANCE, content: fallback.slice(0, PAGE_CHARS) };
      }
      return { url: target, content: null, note: NO_TEXT_NOTE };
    }
    return { url: target, guidance: PAGE_GUIDANCE, content: content.slice(0, PAGE_CHARS) };
  } catch (err) {
    return { error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
