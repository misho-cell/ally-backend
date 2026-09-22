process.env.TAVILY_API_KEY = 'test-key';

/**
 * THE SSRF GUARD HAD A TEST AND THE LINE THAT CALLS IT DID NOT.
 *
 * Sabotage, 22 September: `if (isBlockedFetchHost(new URL(url).hostname))
 * return '';` removed from `fetchRawPageText` — 3,766 tests passed.
 * `webFetchGuards.test.ts` sits right beside it and holds the PREDICATE from
 * ten angles: localhost, 127.*, 10.*, 192.168.*, 169.254.169.254, the 172.16-31
 * block, 0.0.0.0, *.internal, *.local. Every one of those still passes with the
 * call gone, because a predicate nobody consults is a predicate that is still
 * correct.
 *
 * It is the same shape as every other hole found today, and this is the one
 * with a stranger on the other end of it. `fetchRawPageText` is the LAST-RESORT
 * page read: Tavily's extractor comes back empty and we fetch the page
 * ourselves, from inside the container. The url arrives from a web result or
 * from the model, so „169.254.169.254" is not a hypothetical shape — it is the
 * cloud metadata address, and the whole reason the predicate lists it.
 *
 * So this tests the WIRE. Not „does the guard know 127.0.0.1", which is
 * already held, but „does the fetch ask it".
 */
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { fetchPage } from '../webSearch';

/** Tavily answering „I extracted nothing" — the only door to the fallback. */
function tavilyFoundNothing(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [{ raw_content: '   ' }] }),
    text: async () => '',
  });
}

/** And the plain GET that the fallback would then make. */
function thePageItself(body: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    text: async () => body,
  });
}

beforeEach(() => {
  // reset, not clear: `mockResolvedValueOnce` queues survive `clearAllMocks`,
  // and a leftover answer from the previous test is then served as this one's
  // first response — which is how the control in this file failed for a reason
  // that had nothing to do with the guard.
  mockFetch.mockReset();
});

describe('the direct-fetch fallback asks the guard before it fetches', () => {
  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:8080/admin',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://metadata.internal/computeMetadata/v1/',
  ])('never reaches out to %s', async (url) => {
    tavilyFoundNothing();
    thePageItself('<html>secrets</html>');

    const out = (await fetchPage(url)) as { content?: unknown };

    // Tavily was asked. The page itself was NOT — one call, not two.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(out.content).toBeNull();
  });

  /**
   * THE CONTROL, and without it the test above passes for a fallback that
   * never runs at all. An ordinary page must still be read this way — that is
   * what the fallback is for, and the gov pages that defeat the extractor are
   * the reason it exists.
   */
  it('still reads an ordinary page the extractor could not', async () => {
    tavilyFoundNothing();
    thePageItself('<html><body>the notary roster</body></html>');

    const out = (await fetchPage('https://tbilisi.gov.ge/roster')) as { content?: unknown };

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://tbilisi.gov.ge/roster');
    expect(String(out.content)).toContain('the notary roster');
  });

  /**
   * A url that is not a url at all must not throw its way past the guard.
   * `new URL(...)` is inside the try for exactly this reason, and the catch
   * returns '' — refusing, not continuing.
   */
  it('refuses a host it cannot even parse', async () => {
    tavilyFoundNothing();
    thePageItself('<html>secrets</html>');

    // Passes the http(s) check at the top and still fails `new URL`.
    const out = (await fetchPage('http://[not a host]/')) as { content?: unknown };

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(out.content).toBeNull();
  });
});
