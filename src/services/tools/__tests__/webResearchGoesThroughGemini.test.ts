jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../../db/postgres/client';
import { groundedHits, GeminiResponse } from '../geminiSearch';
import {
  pageFetchLedger,
  resetWebSearchSwitchForTests,
  webSearchLedger,
  webSearchProvider,
  WebSearchProvider,
} from '../webSearchProvider';
import { fetchPage, webSearch } from '../webSearch';

const mockQuery = query as jest.MockedFunction<typeof query>;
const fetchMock = jest.fn();

const GROUNDED: GeminiResponse = {
  candidates: [
    {
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://nbg.gov.ge/en/board', title: 'nbg.gov.ge' } },
          { web: { uri: 'https://news.example/item', title: 'news.example' } },
        ],
        groundingSupports: [
          { segment: { text: 'Natia Turnava is the Governor.' }, groundingChunkIndices: [0, 1] },
          { segment: { text: 'She took office in 2023.' }, groundingChunkIndices: [1] },
        ],
      },
    },
  ],
};

function switchIs(on: boolean): void {
  mockQuery.mockResolvedValue({ rows: [{ enabled: on }] } as never);
}

function respond(body: unknown, ok = true, status = 200): object {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  resetWebSearchSwitchForTests();
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  delete process.env.GEMINI_WEB_SEARCH_ON;
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('#7690: the grounded answer becomes ordinary results', () => {
  it('gives one result per page, with the sentences that page supports', () => {
    expect(groundedHits(GROUNDED)).toEqual([
      {
        title: 'nbg.gov.ge',
        url: 'https://nbg.gov.ge/en/board',
        snippet: 'Natia Turnava is the Governor.',
      },
      {
        title: 'news.example',
        url: 'https://news.example/item',
        snippet: 'Natia Turnava is the Governor. She took office in 2023.',
      },
    ]);
  });

  it('gives nothing for an answer with no pages', () => {
    expect(groundedHits({ candidates: [{}] })).toEqual([]);
  });
});

describe('#7690: which engine searches', () => {
  it('is Tavily without a Gemini key, and the switch is never read', async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await webSearchProvider()).toBe(WebSearchProvider.Tavily);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is Tavily with the key while the switch is off, Gemini once it is on', async () => {
    switchIs(false);
    expect(await webSearchProvider()).toBe(WebSearchProvider.Tavily);
    resetWebSearchSwitchForTests();
    switchIs(true);
    expect(await webSearchProvider()).toBe(WebSearchProvider.Gemini);
  });

  it('books a Gemini search and a direct page read to their own prices', async () => {
    switchIs(true);
    expect(await webSearchLedger()).toEqual({
      provider: 'gemini',
      priceKey: 'gemini.search',
      label: 'gemini-3.8-flash',
    });
    expect(await pageFetchLedger()).toEqual({
      provider: 'direct',
      priceKey: 'direct.page_fetch',
    });
  });
});

describe('#7690: a search with the switch on', () => {
  it('asks Gemini with Google Search grounding and returns the pages, official ones marked', async () => {
    switchIs(true);
    fetchMock.mockResolvedValueOnce(respond(GROUNDED));
    const found = (await webSearch('NBG governor')) as {
      results: { url: string; official?: boolean }[];
    };
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(JSON.parse(init.body).tools).toEqual([{ google_search: {} }]);
    expect(found.results.map((r) => r.url)).toEqual([
      'https://nbg.gov.ge/en/board',
      'https://news.example/item',
    ]);
    expect(found.results[0].official).toBe(true);
  });

  it('falls back to Tavily when Gemini refuses', async () => {
    switchIs(true);
    fetchMock
      .mockResolvedValueOnce(respond({ error: 'quota' }, false, 429))
      .mockResolvedValueOnce(respond({ results: [] }));
    process.env.TAVILY_API_KEY = 'tavily-test-key';
    // The Tavily key is read when the module loads, so this test loads its own copy.
    let search: typeof webSearch = webSearch;
    jest.isolateModules(() => {
      search = (jest.requireActual('../webSearch') as { webSearch: typeof webSearch }).webSearch;
    });
    await search('NBG governor');
    delete process.env.TAVILY_API_KEY;
    expect(String(fetchMock.mock.calls[1][0])).toContain('api.tavily.com');
  });

  it('reads a page with our own fetch, not the Tavily extractor', async () => {
    switchIs(true);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><p>Governor: Natia Turnava</p></body></html>',
    });
    const page = (await fetchPage('https://nbg.gov.ge/en/board')) as { content: string };
    expect(page.content).toContain('Natia Turnava');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://nbg.gov.ge/en/board');
  });
});
