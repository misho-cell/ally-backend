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
  '"Deputy CEO in charge of X") to a broader one (e.g. "CEO").';

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
      body: JSON.stringify({ api_key: TAVILY_API_KEY, urls: [target] }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: `Tavily extract error ${response.status}: ${body}` };
    }

    const data = (await response.json()) as TavilyExtractResponse;
    const content = data.results?.[0]?.raw_content ?? '';
    if (!content.trim()) {
      return { url: target, content: null, note: 'The page returned no readable text.' };
    }
    return { url: target, guidance: PAGE_GUIDANCE, content: content.slice(0, PAGE_CHARS) };
  } catch (err) {
    return { error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
