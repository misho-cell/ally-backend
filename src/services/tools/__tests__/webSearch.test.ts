// webSearch reads TAVILY_API_KEY at module load, so each test resets the module
// registry and re-imports it with the env var set to the value under test.
type WebSearch = typeof import('../webSearch').webSearch;

interface MockResponse {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

const originalFetch = global.fetch;

function mockFetch(response: MockResponse): void {
  global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;
}

async function loadWebSearch(apiKey: string | undefined): Promise<WebSearch> {
  jest.resetModules();
  if (apiKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = apiKey;
  const mod = await import('../webSearch');
  return mod.webSearch;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('webSearch', () => {
  it("never surfaces Tavily's synthesized answer (T7 title-inflation fix)", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        answer: 'Giorgi Gureshidze is the CEO as of March 1, 2025.',
        results: [
          {
            title: 'Bank of Georgia — Executive Management Team Updates',
            url: 'https://example.com/rns',
            content:
              'Giorgi Gureshidze, currently Head of Operations, will succeed the Deputy CEO in charge of Mass Retail Banking with effect from 1 March 2025.',
          },
        ],
      }),
    });

    const webSearch = await loadWebSearch('test-key');
    const result = (await webSearch('Bank of Georgia CEO')) as Record<string, unknown>;

    expect(result).not.toHaveProperty('answer');
    expect(result.guidance).toEqual(expect.stringContaining('verbatim'));
    const results = result.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toEqual(
      expect.stringContaining('Deputy CEO in charge of Mass Retail Banking'),
    );
  });

  it('requests results without answer synthesis from Tavily', async () => {
    mockFetch({ ok: true, json: async () => ({ results: [] }) });

    const webSearch = await loadWebSearch('test-key');
    await webSearch('anything');

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body) as {
      include_answer: boolean;
    };
    expect(body.include_answer).toBe(false);
  });

  it('returns an error object when Tavily responds non-ok', async () => {
    mockFetch({ ok: false, status: 503, text: async () => 'unavailable' });

    const webSearch = await loadWebSearch('test-key');
    const result = (await webSearch('x')) as Record<string, unknown>;

    expect(result.error).toEqual(expect.stringContaining('503'));
  });

  it('reports a clear error when the API key is missing', async () => {
    const webSearch = await loadWebSearch(undefined);
    const result = (await webSearch('x')) as Record<string, unknown>;

    expect(result.error).toEqual(expect.stringContaining('TAVILY_API_KEY'));
  });
});
