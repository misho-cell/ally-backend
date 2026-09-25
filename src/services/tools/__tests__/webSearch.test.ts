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

  /**
   * A ROUTE THAT IS DOWN IS NOT A SEARCH THAT FOUND NOTHING, AND THESE TWO
   * TESTS USED TO ASSERT THE OPPOSITE.
   *
   * They pinned the raw provider string being handed back — „Tavily error 503"
   * — and on 23 September that is exactly what reached a real conversation.
   * From 08:09:16 every call failed with „This request exceeds your plan's set
   * usage limit", twelve in five minutes, and what the owner saw was the
   * assistant saying it had found nothing on the web and would try again. The
   * model had nothing else to work from.
   *
   * „I looked and there is nothing" and „I could not look" are different
   * facts, and only the first is ever true when the route is down. So the tests
   * changed with the behaviour rather than being deleted.
   */
  it('says the route is unavailable rather than reporting an empty search', async () => {
    mockFetch({ ok: false, status: 503, text: async () => 'unavailable' });

    const webSearch = await loadWebSearch('test-key');
    const result = (await webSearch('x')) as Record<string, unknown>;

    expect(result.unavailable).toBe(true);
    expect(result.results).toBeUndefined();
    expect(String(result.guidance)).toContain('NOT an empty result');
  });

  /**
   * AND THE PROVIDER'S OWN WORDS MUST NOT REACH THE MODEL. „exceeds your plan's
   * set usage limit. Please upgrade your plan or contact support@tavily.com" is
   * commercial detail about OUR account, handed to something that is talking to
   * a user. A person looking for a plumber does not need to hear which supplier
   * we buy search from or what we owe them.
   */
  it('never hands the supplier’s text or name to the model', async () => {
    mockFetch({
      ok: false,
      status: 432,
      text: async () =>
        '{"detail":{"error":"This request exceeds your plan\'s set usage limit. Please upgrade your plan or contact support@tavily.com"}}',
    });

    const webSearch = await loadWebSearch('test-key');
    const result = JSON.stringify(await webSearch('x'));

    expect(result).not.toMatch(/tavily/i);
    expect(result).not.toContain('usage limit');
    expect(result).not.toContain('upgrade');
    expect(result).not.toContain('432');
  });

  it('treats a missing key the same way, and does not name the key', async () => {
    const webSearch = await loadWebSearch(undefined);
    const result = (await webSearch('x')) as Record<string, unknown>;

    expect(result.unavailable).toBe(true);
    expect(JSON.stringify(result)).not.toContain('TAVILY_API_KEY');
  });
});

type FetchPage = typeof import('../webSearch').fetchPage;

async function loadFetchPage(apiKey: string | undefined): Promise<FetchPage> {
  jest.resetModules();
  if (apiKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = apiKey;
  const mod = await import('../webSearch');
  return mod.fetchPage;
}

describe('fetchPage', () => {
  it("returns the page's readable text with a verbatim-read guidance", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        results: [
          { url: 'https://saburtalo.tbilisi.gov.ge/roster', raw_content: 'Head: Gogi Chikovani' },
        ],
      }),
    });

    const fetchPage = await loadFetchPage('test-key');
    const result = (await fetchPage('https://saburtalo.tbilisi.gov.ge/roster')) as Record<
      string,
      unknown
    >;

    expect(result.content).toEqual(expect.stringContaining('Gogi Chikovani'));
    expect(result.guidance).toEqual(expect.stringContaining('verbatim'));
  });

  it('rejects a non-http URL without calling the network', async () => {
    mockFetch({ ok: true, json: async () => ({}) });
    const fetchPage = await loadFetchPage('test-key');

    const result = (await fetchPage('not-a-url')) as Record<string, unknown>;

    expect(result.error).toEqual(expect.stringContaining('http'));
    expect(global.fetch as jest.Mock).not.toHaveBeenCalled();
  });

  it('reports a note when the page has no readable text', async () => {
    mockFetch({
      ok: true,
      json: async () => ({ results: [{ url: 'https://x.com', raw_content: '' }] }),
    });
    const fetchPage = await loadFetchPage('test-key');

    const result = (await fetchPage('https://x.com')) as Record<string, unknown>;

    expect(result.content).toBeNull();
    expect(result.note).toEqual(expect.stringContaining('no readable text'));
  });

  it('errors when the API key is missing', async () => {
    const fetchPage = await loadFetchPage(undefined);
    const result = (await fetchPage('https://x.com')) as Record<string, unknown>;

    expect(result.error).toEqual(expect.stringContaining('TAVILY_API_KEY'));
  });
});

/**
 * ⚠️ 25 SEPTEMBER — THE MODEL WAS SHOWN PART OF A PAGE AND TOLD TO CONCLUDE
 * FROM IT.
 *
 * „ვინ არის ახლა თბილისის მერი?" The run fetched tbilisi.gov.ge/government/2
 * twice, got 8,471 characters back both times, and answered that the mayor's
 * name „is not readable in the page's text, only menu links". The tester then
 * opened the same page in a real browser: it carries the name.
 *
 * The content is cut at the character limit and NOTHING SAID SO. Over every
 * page this product has ever fetched, 44 of 96 hit the cap — forty-six per
 * cent — and on every one of them the guidance said „if the page does not
 * state it, say so" to a model that had been shown only the beginning.
 *
 * „I was not shown it" coming out as „the page does not say it" is the same
 * confusion as `push_deliveries` reporting failed = 0, and as `ok = false`
 * meaning both a refusal and a fault — this time inside the tool D151 leans on.
 */
describe('a page that was cut says so', () => {
  async function loadFetchPage(): Promise<typeof import('../webSearch').fetchPage> {
    jest.resetModules();
    process.env.TAVILY_API_KEY = 'test-key';
    const mod = await import('../webSearch');
    return mod.fetchPage;
  }

  const pageOf = (chars: number): MockResponse => ({
    ok: true,
    json: async () => ({ results: [{ raw_content: 'x'.repeat(chars) }] }),
  });

  it('tells the model it has only the first part, and what that is worth', async () => {
    mockFetch(pageOf(40_000));
    const fetchPage = await loadFetchPage();

    const out = (await fetchPage('https://tbilisi.gov.ge/government/2')) as Record<string, unknown>;

    expect(out.read).toBe('partial');
    expect(out.characters_available).toBe(40_000);
    expect(String(out.guidance)).toContain('FIRST PART');
    expect(String(out.guidance)).toContain('you have NOT established that the page lacks it');
  });

  /** A whole page keeps the original wording and says nothing about cutting. */
  it('says nothing when the whole page fits', async () => {
    mockFetch(pageOf(1_200));
    const fetchPage = await loadFetchPage();

    const out = (await fetchPage('https://example.com/a')) as Record<string, unknown>;

    expect(out.read).toBeUndefined();
    expect(out.characters_available).toBeUndefined();
    expect(String(out.guidance)).toContain("This is the page's own text");
    expect(String(out.guidance)).not.toContain('FIRST PART');
  });

  /** The text itself is still capped — this changes what is SAID, not the size. */
  it('still sends only the capped text', async () => {
    mockFetch(pageOf(40_000));
    const fetchPage = await loadFetchPage();

    const out = (await fetchPage('https://example.com/a')) as Record<string, unknown>;

    expect(String(out.content)).toHaveLength(8000);
  });

  /**
   * The counts are in the result so a PERSON reading the log can see it too.
   * „Why did it say the page does not mention him" is answerable now.
   */
  it('records the numbers, not only the sentence', async () => {
    mockFetch(pageOf(12_345));
    const fetchPage = await loadFetchPage();

    const out = (await fetchPage('https://example.com/a')) as Record<string, unknown>;

    expect(out.characters_shown).toBe(8000);
    expect(out.characters_available).toBe(12_345);
  });
});
