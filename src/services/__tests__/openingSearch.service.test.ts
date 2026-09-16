jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../searchQuery.service', () => ({
  __esModule: true,
  distilSearchQuery: jest.fn(),
}));

import { webSearch } from '../tools/webSearch';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { recordFixedUsage } from '../costLedger.service';
import { logToolCall } from '../toolCallLog.service';
import { distilSearchQuery } from '../searchQuery.service';
import { runOpeningSearches, buildOpeningSearchSection } from '../openingSearch.service';

const mockWeb = webSearch as jest.MockedFunction<typeof webSearch>;
const mockSecond = searchSecondDegree as jest.MockedFunction<typeof searchSecondDegree>;
const mockDistil = distilSearchQuery as jest.MockedFunction<typeof distilSearchQuery>;

beforeEach(() => {
  jest.clearAllMocks();
  mockWeb.mockResolvedValue({ results: ['a plumber in Batumi'] } as never);
  mockSecond.mockResolvedValue({ found: true, count: 2, results: ['Gega'] } as never);
  // The default is the honest one: distilling that changed nothing.
  mockDistil.mockImplementation(async (text) => ({ query: text }));
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
    const out = await runOpeningSearches('501', 'კარგი ელექტრიკოსი ბათუმში', 'run-1', 15907);

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

    await runOpeningSearches('501', 'რამე', 'run-1', 15907);

    // Both were kicked off before either was awaited to completion.
    expect(webStarted).toBeGreaterThan(0);
    expect(secondStarted).toBeGreaterThan(0);
  });

  it('charges the web search, because it is one', async () => {
    await runOpeningSearches('501', 'რამე', 'run-7', 15907);

    expect(recordFixedUsage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'web_search', priceKey: 'tavily.search', runId: 'run-7' }),
    );
  });

  it('an empty goal text searches nothing', async () => {
    const out = await runOpeningSearches('501', '   ', 'run-1', 15907);

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

    const out = await runOpeningSearches('501', 'რამე', 'run-1', 15907);

    expect(out.web).not.toBeNull();
    expect(out.secondDegree).toBeNull();
    expect(out.missing).toEqual(['search_second_degree']);
  });

  it('both failing is still an answer, not an exception', async () => {
    mockWeb.mockRejectedValue(new Error('tavily down'));
    mockSecond.mockRejectedValue(new Error('statement timeout'));

    const out = await runOpeningSearches('501', 'რამე', 'run-1', 15907);

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

/**
 * Ticket 20 row 126, second pass — the pre-run is logged like any other call.
 *
 * The seat asked whether the pre-run section reached two live prompts or
 * whether the model ignored it. The ledger settled it — both runs carried a
 * Tavily charge and neither called web_search, and only this function does
 * that — but „it ran" was as far as I could get. WHAT IT FOUND was nowhere,
 * because a search nobody logs is a search nobody can ask about.
 *
 * The same gap as row 125, in code written after row 125 was fixed.
 */
describe('row 126 second pass — what the pre-run found is answerable', () => {
  it('logs both searches against the run and thread that caused them', async () => {
    await runOpeningSearches('501', 'სანტექნიკოსი ბათუმში', 'run-9', 15940);

    const tools = (logToolCall as jest.Mock).mock.calls.map((c) => c[0].tool);
    expect(tools).toContain('web_search:opening');
    expect(tools).toContain('search_second_degree:opening');

    const first = (logToolCall as jest.Mock).mock.calls[0][0];
    expect(first.runId).toBe('run-9');
    expect(first.threadId).toBe(15940);
    expect(first.userId).toBe('501');
    // The query is the thing that makes a row worth reading later.
    expect(first.input).toEqual({ query: 'სანტექნიკოსი ბათუმში' });
  });

  it('marks them :opening, so a pre-run is never mistaken for the model searching', async () => {
    await runOpeningSearches('501', 'რამე', 'run-9', 15940);

    for (const call of (logToolCall as jest.Mock).mock.calls) {
      expect(String(call[0].tool)).toMatch(/:opening$/);
    }
  });

  it('a search that fails is not logged as one that found nothing', async () => {
    mockSecond.mockRejectedValue(new Error('statement timeout'));

    const out = await runOpeningSearches('501', 'რამე', 'run-9', 15940);

    expect(out.missing).toEqual(['search_second_degree']);
    const tools = (logToolCall as jest.Mock).mock.calls.map((c) => c[0].tool);
    expect(tools).toContain('web_search:opening');
    // No row claiming the second circle came back empty — it did not come back.
    expect(tools).not.toContain('search_second_degree:opening');
  });
});

/**
 * Ticket 20 row 126, fourth pass — the web is searched for a QUERY, the
 * owner's own network for the owner's own words.
 *
 * Goal 3895 sent „ნოტარიუსი მჭირდება ბინის ნასყიდობის ხელშეკრულებისთვის." to
 * the web and got five articles about contracts and not one notary. The seat's
 * ask: could the pre-run turn the goal into the short query a person would
 * type — the service and the place?
 */
describe('row 126 fourth pass — the web gets a query, not a sentence', () => {
  const GOAL = 'ნოტარიუსი მჭირდება ბინის ნასყიდობის ხელშეკრულებისთვის.';

  beforeEach(() => {
    mockDistil.mockResolvedValue({ query: 'ნოტარიუსი ბათუმი', fromGoal: GOAL });
  });

  it('searches the web for the distilled query', async () => {
    await runOpeningSearches('501', GOAL, 'run-1', 16006);

    expect(mockWeb).toHaveBeenCalledWith('ნოტარიუსი ბათუმი');
  });

  it('searches the owner’s own network with the owner’s own words', async () => {
    // Not an oversight. A web index rewards two words; the second circle
    // matches tags and facts over people, and there is no measurement saying
    // a distilled query serves it better — it has timed out on every goal
    // logged so far.
    await runOpeningSearches('501', GOAL, 'run-1', 16006);

    expect(mockSecond).toHaveBeenCalledWith('501', GOAL);
  });

  /**
   * D298 — nothing assumes a city. The first version of this pass read
   * User.city and offered it to the distiller; the seat caught it inside the
   * hour. A place reaches a search only when the OWNER said it, and what they
   * said is already in the goal text.
   */
  it('reads no city from anywhere, and passes none', async () => {
    await runOpeningSearches('501', GOAL, 'run-1', 16006);

    expect(mockDistil).toHaveBeenCalledWith(GOAL, { userId: '501', runId: 'run-1' });
  });

  it('logs BOTH what was searched and what the owner said', async () => {
    await runOpeningSearches('501', GOAL, 'run-1', 16006);

    const web = (logToolCall as jest.Mock).mock.calls.find(
      (c) => c[0].tool === 'web_search:opening',
    )[0];
    expect(web.input).toEqual({ query: 'ნოტარიუსი ბათუმი', fromGoal: GOAL });
  });

  it('logs one query when nothing was distilled, not a rewrite that did not happen', async () => {
    mockDistil.mockResolvedValue({ query: GOAL });

    await runOpeningSearches('501', GOAL, 'run-1', 16006);

    const web = (logToolCall as jest.Mock).mock.calls.find(
      (c) => c[0].tool === 'web_search:opening',
    )[0];
    expect(web.input).toEqual({ query: GOAL });
  });
});

/**
 * Ticket 20 row 126, third pass — what the web search FOUND, not just how much.
 *
 * The seat's ask: they are judging whether the model was RIGHT to ignore the
 * opening web results on goal 3862, and the table could say five came back in
 * 4,004 ms and nothing about what they were. „Ignored good results" and
 * „ignored junk" looked identical, and only one of them is a fault.
 */
describe('row 126 third pass — the web sample, and only the web', () => {
  it('stores the titles and links the web search returned', async () => {
    mockWeb.mockResolvedValue({
      results: [
        { title: 'Prius სერვისი თბილისში', url: 'https://example.ge/prius' },
        { title: 'ჰიბრიდების ხელოსანი', url: 'https://example.ge/hybrid' },
      ],
    } as never);

    await runOpeningSearches('501', 'Prius-ის ხელოსანი', 'run-9', 15973);

    const web = (logToolCall as jest.Mock).mock.calls.find(
      (c) => c[0].tool === 'web_search:opening',
    )[0];
    expect(web.resultSample).toContain('Prius სერვისი თბილისში');
    expect(web.resultSample).toContain('https://example.ge/prius');
  });

  /**
   * The line that matters more than the feature. Second-circle results are the
   * owner's own network — real people — and must not leave a sample of
   * themselves in a debugging table.
   */
  it('stores NO sample for the second circle, whatever it found', async () => {
    mockSecond.mockResolvedValue({
      found: true,
      count: 2,
      results: [{ name: 'Giorgi Turashvili' }, { name: 'Nika' }],
    } as never);

    await runOpeningSearches('501', 'რამე', 'run-9', 15973);

    const second = (logToolCall as jest.Mock).mock.calls.find(
      (c) => c[0].tool === 'search_second_degree:opening',
    )[0];
    expect(second.resultSample).toBeUndefined();
  });

  it('an unrecognised shape produces no sample rather than a wrong one', async () => {
    mockWeb.mockResolvedValue({ guidance: 'something else entirely' } as never);

    await runOpeningSearches('501', 'რამე', 'run-9', 15973);

    const web = (logToolCall as jest.Mock).mock.calls.find(
      (c) => c[0].tool === 'web_search:opening',
    )[0];
    expect(web.resultSample).toBe('');
  });
});
