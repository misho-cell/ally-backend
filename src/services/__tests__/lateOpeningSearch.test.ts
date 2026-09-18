jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

/**
 * D315 says the opening searches must RUN, immediately, and never be skipped.
 * It does not say the owner must wait for them.
 *
 * Measured over 14 days, 87 calls of search_second_degree:opening: 19 landed
 * inside the old 10-second budget, 26 inside 15, and 45 never finished at all
 * — they die at 16.0 to 17.3 s on the query's own statement timeout. So every
 * goal's first reply waited ten seconds to keep about one result in five.
 *
 * These tests are about the DELIVERY CONTRACT, which is the part that can go
 * wrong quietly: a result handed over twice would put the same block in the
 * model's history repeatedly, and one handed over before it exists would be a
 * section built from nothing.
 */
describe('the opening searches arrive late, once, and only when they exist', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../openingSearch.service', () => ({
      __esModule: true,
      runOpeningSearches: jest.fn(),
      buildOpeningSearchSection: (found: { web: string | null }) => `SECTION:${found.web}`,
      buildFromTheWebMessage: jest.fn(),
      findWaysIn: jest.fn(),
      webResultNames: jest.fn(),
      WAY_IN_TOOL_NOTE: '',
    }));
  });

  async function startWith(promise: Promise<unknown>): Promise<{ takeIfReady(): string | null }> {
    const opening = await import('../openingSearch.service');
    (opening.runOpeningSearches as jest.Mock).mockReturnValue(promise);
    mod = await import('../chat.service');
    return (
      mod as {
        __startOpeningSearchesForTest: (...a: unknown[]) => { takeIfReady(): string | null };
      }
    ).__startOpeningSearchesForTest('501', 'need a vet', 'run1', 1);
  }

  it('gives nothing back while the search is still running', async () => {
    const late = await startWith(new Promise(() => undefined));

    expect(late.takeIfReady()).toBeNull();
    expect(late.takeIfReady()).toBeNull();
  });

  it('hands the section over once it lands', async () => {
    const late = await startWith(Promise.resolve({ web: 'found', waysIn: new Map() }));
    await Promise.resolve();
    await Promise.resolve();

    expect(late.takeIfReady()).toBe('SECTION:found');
  });

  it('hands it over ONCE — a second round must not repeat it', async () => {
    const late = await startWith(Promise.resolve({ web: 'found', waysIn: new Map() }));
    await Promise.resolve();
    await Promise.resolve();

    expect(late.takeIfReady()).toBe('SECTION:found');
    expect(late.takeIfReady()).toBeNull();
    expect(late.takeIfReady()).toBeNull();
  });

  it('survives a search that fails, and simply never delivers', async () => {
    // A first reply must not depend on either search succeeding — that was
    // true when it blocked and it is still true now.
    const late = await startWith(Promise.reject(new Error('statement timeout')));
    await Promise.resolve();
    await Promise.resolve();

    expect(late.takeIfReady()).toBeNull();
  });
});
