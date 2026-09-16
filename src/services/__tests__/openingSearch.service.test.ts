jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));

import { webSearch } from '../tools/webSearch';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { recordFixedUsage } from '../costLedger.service';
import { runOpeningSearches, buildOpeningSearchSection } from '../openingSearch.service';

const mockWeb = webSearch as jest.MockedFunction<typeof webSearch>;
const mockSecond = searchSecondDegree as jest.MockedFunction<typeof searchSecondDegree>;

beforeEach(() => {
  jest.clearAllMocks();
  mockWeb.mockResolvedValue({ results: ['a plumber in Batumi'] } as never);
  mockSecond.mockResolvedValue({ found: true, count: 2, results: ['Gega'] } as never);
});

/**
 * Ticket 20 row 126 — a named problem starts the web and the second circle at
 * once, every time.
 *
 * Measured over 36 hours, of the 63 runs that searched at all: both 14, second
 * circle only 28, web only 17, neither 4. It is not one of the two being
 * forgotten — it is both — and task_main already asks for this three times.
 */
describe('the opening searches run without being asked', () => {
  it('runs BOTH, on the goal text', async () => {
    const out = await runOpeningSearches('501', 'კარგი ელექტრიკოსი ბათუმში', 'run-1');

    expect(mockWeb).toHaveBeenCalledWith('კარგი ელექტრიკოსი ბათუმში');
    expect(mockSecond).toHaveBeenCalledWith('501', 'კარგი ელექტრიკოსი ბათუმში');
    expect(out.web).toContain('a plumber in Batumi');
    expect(out.secondDegree).toContain('Gega');
    expect(out.missing).toEqual([]);
  });

  it('starts them together rather than one after the other', async () => {
    // The budget is the slower of the two, not their sum, and that is only
    // true if they are actually concurrent.
    let webStarted = 0;
    let secondStarted = 0;
    let order = 0;
    mockWeb.mockImplementation(async () => {
      webStarted = ++order;
      return { results: [] } as never;
    });
    mockSecond.mockImplementation(async () => {
      secondStarted = ++order;
      return { found: false } as never;
    });

    await runOpeningSearches('501', 'რამე', 'run-1');

    // Both were kicked off before either was awaited to completion.
    expect(webStarted).toBeGreaterThan(0);
    expect(secondStarted).toBeGreaterThan(0);
  });

  it('charges the web search, because it is one', async () => {
    await runOpeningSearches('501', 'რამე', 'run-7');

    expect(recordFixedUsage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'web_search', priceKey: 'tavily.search', runId: 'run-7' }),
    );
  });

  it('an empty goal text searches nothing', async () => {
    const out = await runOpeningSearches('501', '   ', 'run-1');

    expect(mockWeb).not.toHaveBeenCalled();
    expect(mockSecond).not.toHaveBeenCalled();
    expect(out).toEqual({ web: null, secondDegree: null, missing: [] });
  });

  /**
   * The half that matters most: a first reply must never depend on either of
   * these succeeding. This runs before the model's first turn, so a throw here
   * would take the whole answer with it.
   */
  it('one search failing does not take the other, or the run, with it', async () => {
    mockSecond.mockRejectedValue(new Error('statement timeout'));

    const out = await runOpeningSearches('501', 'რამე', 'run-1');

    expect(out.web).not.toBeNull();
    expect(out.secondDegree).toBeNull();
    expect(out.missing).toEqual(['search_second_degree']);
  });

  it('both failing is still an answer, not an exception', async () => {
    mockWeb.mockRejectedValue(new Error('tavily down'));
    mockSecond.mockRejectedValue(new Error('statement timeout'));

    const out = await runOpeningSearches('501', 'რამე', 'run-1');

    expect(out.missing).toEqual(['web_search', 'search_second_degree']);
  });
});

describe('what the model is told about them', () => {
  it('says they have ALREADY run, so they are not run again', () => {
    const section = buildOpeningSearchSection({
      web: '{"results":["floristi.ge"]}',
      secondDegree: '{"found":true}',
      missing: [],
    });

    expect(section).toContain('უკვე შესრულებულია');
    expect(section).toContain('ხელახლა ნუ გამოიძახებ');
    expect(section).toContain('floristi.ge');
  });

  /**
   * Ticket 19 G7's lesson, in a new place. "The second circle is empty" and
   * "the second circle did not answer in time" are different facts, and a run
   * has been reported stating the first when the second was true.
   */
  it('names what did not arrive instead of letting it read as empty', () => {
    const section = buildOpeningSearchSection({
      web: '{"results":[]}',
      secondDegree: null,
      missing: ['search_second_degree'],
    });

    expect(section).toContain('ვერ მოასწრო: search_second_degree');
    expect(section).toContain('არაფერია');
    expect(section).toContain('„ვერაფერი მოიძებნა" არ თქვა');
  });

  it('is empty when nothing ran — an ordinary turn keeps its prompt byte-identical', () => {
    expect(buildOpeningSearchSection({ web: null, secondDegree: null, missing: [] })).toBe('');
  });

  it('clips a runaway result rather than burying the rest of the prompt', () => {
    const section = buildOpeningSearchSection({
      web: 'x'.repeat(20_000),
      secondDegree: null,
      missing: ['search_second_degree'],
    });

    expect(section.length).toBeLessThan(8_000);
    // And the part after it still arrives.
    expect(section).toContain('ვერ მოასწრო');
  });
});
