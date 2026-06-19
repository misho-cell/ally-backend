import { hasGeorgian, georgianToLatin } from './transliterate';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_TIMEOUT_MS = 12_000;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  answer?: string;
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
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: `Tavily error ${response.status}: ${body}` };
    }

    const data = (await response.json()) as TavilyResponse;

    return {
      answer: data.answer ?? null,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 400),
      })),
    };
  } catch (err) {
    return { error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
