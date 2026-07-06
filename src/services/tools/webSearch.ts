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

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
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
