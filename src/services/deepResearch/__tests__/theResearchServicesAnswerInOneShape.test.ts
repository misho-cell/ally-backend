import { ProviderName } from '../deepResearch.types';
import { ProviderError } from '../providerHttp';
import {
  ExaCategory,
  LinkupDepth,
  SEARCH_TEXT_CHARS,
  exaHits,
  exaSearch,
  firecrawlPage,
  linkupHits,
  linkupSearch,
  providerKeysSet,
} from '../searchProviders';

const mockFetch = jest.fn();
const ENV = { ...process.env };

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env = {
    ...ENV,
    EXA_API_KEY: 'exa-test',
    LINKUP_API_KEY: 'lk-test',
    FIRECRAWL_API_KEY: 'fc-test',
  };
});

afterAll(() => {
  process.env = ENV;
});

function answer(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    json: async () => body,
  } as unknown as Response;
}

/** Misho, 19 Nov: Exa, Linkup and Firecrawl, each read into one shape. */
describe('the research services answer in one shape', () => {
  it('reads Exa results, cuts long text and drops a result without an address', () => {
    const hits = exaHits({
      results: [
        { url: 'https://colibri.ge/team', title: 'Team', text: 'x'.repeat(SEARCH_TEXT_CHARS + 50) },
        { title: 'no address' },
      ],
    });
    expect(hits).toEqual([
      {
        provider: ProviderName.Exa,
        url: 'https://colibri.ge/team',
        title: 'Team',
        text: 'x'.repeat(SEARCH_TEXT_CHARS),
      },
    ]);
    expect(exaHits(null)).toEqual([]);
  });

  it('reads Linkup text results and leaves images out', () => {
    expect(
      linkupHits({
        results: [
          {
            type: 'text',
            name: 'Interview',
            url: 'https://news.ge/a',
            content: 'Nino Beridze said',
          },
          { type: 'image', name: 'Photo', url: 'https://news.ge/p.jpg' },
        ],
      }),
    ).toEqual([
      {
        provider: ProviderName.Linkup,
        url: 'https://news.ge/a',
        title: 'Interview',
        text: 'Nino Beridze said',
      },
    ]);
  });

  it('reads a Firecrawl page, and nothing when the page was empty', () => {
    expect(
      firecrawlPage(
        { data: { markdown: ' # About ', metadata: { title: 'About' } } },
        'https://a.ge',
      ),
    ).toEqual({
      provider: ProviderName.Firecrawl,
      url: 'https://a.ge',
      title: 'About',
      text: '# About',
    });
    expect(firecrawlPage({ data: { markdown: '' } }, 'https://a.ge')).toBeNull();
  });

  it('sends the key from the environment, and asks Exa for its people index only when told', async () => {
    mockFetch.mockResolvedValue(answer({ results: [] }));
    await exaSearch('Nino Beridze Colibri', ExaCategory.People);
    await exaSearch('"Nino Beridze"', ExaCategory.Web);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.exa.ai/search');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('exa-test');
    expect(JSON.parse(String(init.body)).category).toBe('people');
    expect(
      JSON.parse(String((mockFetch.mock.calls[1] as [string, RequestInit])[1].body)).category,
    ).toBeUndefined();
  });

  it('asks Linkup for search results at the depth given', async () => {
    mockFetch.mockResolvedValue(answer({ results: [] }));
    await linkupSearch('Levan Japaridze', LinkupDepth.Deep);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer lk-test');
    expect(JSON.parse(String(init.body))).toMatchObject({
      q: 'Levan Japaridze',
      depth: 'deep',
      outputType: 'searchResults',
    });
  });

  it('turns a refused call into a ProviderError that names the service and status only', async () => {
    mockFetch.mockResolvedValue(answer({ error: 'echo of the request' }, 401));
    await expect(exaSearch('x', ExaCategory.Web)).rejects.toEqual(
      expect.objectContaining({ provider: ProviderName.Exa, status: 401 }),
    );
    await expect(exaSearch('x', ExaCategory.Web)).rejects.toBeInstanceOf(ProviderError);
  });

  it('is set up only when all three keys are', () => {
    expect(providerKeysSet()).toBe(true);
    process.env.LINKUP_API_KEY = ' ';
    expect(providerKeysSet()).toBe(false);
  });
});
