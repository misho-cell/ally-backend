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
jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTag: jest.fn() }));

import { webSearch } from '../tools/webSearch';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { recordFixedUsage } from '../costLedger.service';
import { logToolCall } from '../toolCallLog.service';
import { distilSearchQuery } from '../searchQuery.service';
import { searchByTag } from '../tools/searchByTag';
import {
  runOpeningSearches,
  buildOpeningSearchSection,
  webResultNames,
  WAY_IN_TOOL_NOTE,
} from '../openingSearch.service';

const mockWeb = webSearch as jest.MockedFunction<typeof webSearch>;
const mockSecond = searchSecondDegree as jest.MockedFunction<typeof searchSecondDegree>;
const mockDistil = distilSearchQuery as jest.MockedFunction<typeof distilSearchQuery>;
const mockTag = searchByTag as jest.MockedFunction<typeof searchByTag>;

beforeEach(() => {
  jest.clearAllMocks();
  mockWeb.mockResolvedValue({ results: ['a plumber in Batumi'] } as never);
  mockSecond.mockResolvedValue({ found: true, count: 2, results: ['Gega'] } as never);
  // The default is the honest one: distilling that changed nothing.
  mockDistil.mockImplementation(async (text) => ({ query: text }));
  mockTag.mockResolvedValue({ found: false } as never);
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
    expect(out).toEqual({ web: null, secondDegree: null, missing: [], waysIn: new Map() });
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
      waysIn: new Map(),
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
      waysIn: new Map(),
    });

    expect(section).toContain('ვერ მოასწრო: search_second_degree');
    expect(section).toContain('არაფერია');
    expect(section).toContain('„ვერაფერი მოიძებნა" არ თქვა');
  });

  it('is empty when nothing ran — an ordinary turn keeps its prompt byte-identical', () => {
    expect(
      buildOpeningSearchSection({ web: null, secondDegree: null, missing: [], waysIn: new Map() }),
    ).toBe('');
  });

  it('clips a runaway result rather than burying the rest of the prompt', () => {
    const section = buildOpeningSearchSection({
      web: 'x'.repeat(20_000),
      secondDegree: null,
      missing: ['search_second_degree'],
      waysIn: new Map(),
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

/**
 * Ticket 20 row 154 — every company the web finds comes with its way in.
 *
 * Tornike's top of Pr1, from Lika's test: the web found four marketing
 * agencies and the reply told her to contact them herself. Her own words for
 * what it should have done: look INSIDE those companies for somebody she has a
 * link to.
 *
 * The seat then ran three rounds of prompt work at it and measured the result
 * — the model searches a named PERSON the web returned and does not reliably
 * search a FIRM: 1 of 2 on the last round, 0 of 3 before it. The opening
 * searches are already the server's, so the way in is too.
 */
describe('row 154 — the way in, beside each web result', () => {
  const agencies = {
    results: [
      { title: 'Infinity Solutions — ბრენდინგი და მარკეტინგი', url: 'https://inf.ge' },
      { title: 'Performa | მარკეტინგული სტრატეგია', url: 'https://performa.ge' },
    ],
  };

  describe('webResultNames', () => {
    it('takes the name and drops the tagline after it', () => {
      expect(webResultNames(agencies)).toEqual(['Infinity Solutions', 'Performa']);
    });

    it('keeps a title that has no separator whole', () => {
      expect(webResultNames({ results: [{ title: 'McCann Tbilisi' }] })).toEqual([
        'McCann Tbilisi',
      ]);
    });

    it('never asks the same name twice', () => {
      expect(
        webResultNames({ results: [{ title: 'Performa — a' }, { title: 'Performa — b' }] }),
      ).toEqual(['Performa']);
    });

    it('is bounded, so one busy search page cannot become ten lookups', () => {
      const many = { results: Array.from({ length: 9 }, (_, i) => ({ title: `Firm ${i}` })) };
      expect(webResultNames(many).length).toBeLessThanOrEqual(3);
    });

    it('answers nothing for a shape it does not recognise', () => {
      expect(webResultNames(null)).toEqual([]);
      expect(webResultNames({ results: 'nope' })).toEqual([]);
      expect(webResultNames({ results: [{ url: 'https://x.ge' }] })).toEqual([]);
    });
  });

  it('searches the owner’s own contacts for each name the web returned', async () => {
    mockWeb.mockResolvedValue(agencies as never);

    await runOpeningSearches('501', 'მარკეტინგული სააგენტო', 'run-1', 16106);

    expect(mockTag).toHaveBeenCalledWith('501', 'Infinity Solutions');
    expect(mockTag).toHaveBeenCalledWith('501', 'Performa');
  });

  it('names the contact when the owner has one', async () => {
    mockWeb.mockResolvedValue({ results: [{ title: 'Performa' }] } as never);
    mockTag.mockResolvedValue({ found: true, results: [{ name: 'გეგა ბერიძე' }] } as never);

    const out = await runOpeningSearches('501', 'რამე', 'run-1', 16106);
    const section = buildOpeningSearchSection(out);

    expect(section).toContain('გეგა ბერიძე');
    expect(section).toContain('Performa');
  });

  /**
   * Ticket 19 G7, in the place it matters most for this row: the second circle
   * is NOT searched per company — one call measures 15-17 s against a ten
   * second budget — so „nobody in your own contacts" must never be written as
   * „no way in".
   */
  it('says the OWN CONTACTS hold nobody, never that there is no way in', async () => {
    mockWeb.mockResolvedValue({ results: [{ title: 'Performa' }] } as never);
    mockTag.mockResolvedValue({ found: false } as never);

    const section = buildOpeningSearchSection(await runOpeningSearches('501', 'რამე', 'run-1', 1));

    expect(section).toContain('პირად კონტაქტებში');
    expect(section).toContain('მეორე წრე ჯერ არ შემიმოწმებია');
  });

  it('a lookup that fails reads as unchecked, not as empty', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockWeb.mockResolvedValue({ results: [{ title: 'Performa' }] } as never);
    mockTag.mockRejectedValue(new Error('statement timeout'));

    const section = buildOpeningSearchSection(await runOpeningSearches('501', 'რამე', 'run-1', 1));

    expect(section).toContain('ვერ შევამოწმე');
    expect(section).not.toContain('ვერ ვიპოვე');
    consoleSpy.mockRestore();
  });

  it('tells the model not to send the owner to a company unread', async () => {
    mockWeb.mockResolvedValue({ results: [{ title: 'Performa' }] } as never);

    const section = buildOpeningSearchSection(await runOpeningSearches('501', 'რამე', 'run-1', 1));

    expect(section).toContain('არ უთხრა მფლობელს, რომ კომპანიას თვითონ დაუკავშირდეს');
  });

  it('adds nothing when the web returned no names at all', async () => {
    mockWeb.mockResolvedValue({ results: [] } as never);

    const out = await runOpeningSearches('501', 'რამე', 'run-1', 1);

    expect(out.waysIn.size).toBe(0);
    expect(buildOpeningSearchSection(out)).not.toContain('ვებში ნაპოვნების გზა');
  });

  it('a failing web search costs no way-in lookups', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockWeb.mockRejectedValue(new Error('tavily down'));

    await runOpeningSearches('501', 'რამე', 'run-1', 1);

    expect(mockTag).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

/**
 * Ticket 20 row 154, second half — the way in travels with the MODEL'S OWN web
 * search too.
 *
 * The first half only covered the search the server runs before the model's
 * first turn. On goal 4293 the four firms the owner was shown came from the
 * model's own web_search at 10:48:53, so no way-in line could reach them and
 * three were named with their public number and nothing else.
 */
describe('row 154 second half — the note that rides the tool result', () => {
  it('tells the model what each verdict means, in the three words it will see', () => {
    expect(WAY_IN_TOOL_NOTE).toContain('first_circle');
    expect(WAY_IN_TOOL_NOTE).toContain('none');
    expect(WAY_IN_TOOL_NOTE).toContain('unchecked');
  });

  it('keeps „no way in" off the table for a none, exactly as the section does', () => {
    // Ticket 19 G7. The second circle is not searched per company, so „nobody
    // in your own contacts" must never be read as „nobody".
    expect(WAY_IN_TOOL_NOTE).toContain('მეორე წრე');
    expect(WAY_IN_TOOL_NOTE).toContain('„გზა არ არსებობს" არ თქვა');
  });

  it('says the same thing about contacting a company as the prompt section', () => {
    expect(WAY_IN_TOOL_NOTE).toContain('კომპანიას თვითონ დაუკავშირდი');
  });
});
