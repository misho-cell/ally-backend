const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

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

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
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
  }
}
