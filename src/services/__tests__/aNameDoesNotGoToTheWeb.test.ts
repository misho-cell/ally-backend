jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTagExactOnly: jest.fn() }));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));
// The LOCAL distiller is the real one on purpose: it makes no call and has no
// side effect, and a stub of it would hide the very thing row 253's second
// door is about — that an introduction goal reaches no provider at all.
jest.mock('../searchQuery.service', () => ({
  __esModule: true,
  distilSearchQuery: jest.fn(),
  distilIntroductionLocally: jest.requireActual('../searchQuery.service').distilIntroductionLocally,
}));

import { webSearch } from '../tools/webSearch';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { distilSearchQuery } from '../searchQuery.service';
import { recordFixedUsage } from '../costLedger.service';
import { goalAsksToReachAPerson, runOpeningSearches } from '../openingSearch.service';

/**
 * ROW 253 — THE PRODUCT WAS SENDING ITS OWN USERS' NAMES TO A SEARCH ENGINE.
 *
 * Found on 22 September while measuring something else. `web_search:opening`
 * logs the distilled query beside the goal text, and on introduction goals it
 * read:
 *
 *   query=Netai Test 1            goal=Ask Netai Test 1 to introduce me to Netai Test 2.
 *   query=Netai Test 8 contact    goal=I want to be introduced to Netai Test 9 through Netai Test 8
 *   query=Netai Test 10           goal=Arrange a meeting with Netai Test 10 next week
 *   query=<a real personal name>  goal=I need to reach <them> — do you know them?
 *
 * Since 16 September: 320 opening web searches, 41 carrying a test seat's name
 * or an „introduce" phrase, ONE carrying a real person's.
 *
 * D149 is written about phone numbers, and this is not a number — it is a
 * person's name together with the fact that somebody wants to be introduced to
 * them, handed to an outside service. Same class. And it cannot be defended as
 * a call that might have helped: the web has never heard of „Netai Test 8".
 */
const mockWeb = webSearch as jest.MockedFunction<typeof webSearch>;
const mockSecond = searchSecondDegree as jest.MockedFunction<typeof searchSecondDegree>;
const mockDistil = distilSearchQuery as jest.MockedFunction<typeof distilSearchQuery>;
const mockCharge = recordFixedUsage as jest.MockedFunction<typeof recordFixedUsage>;

beforeEach(() => {
  jest.clearAllMocks();
  mockWeb.mockResolvedValue({ results: [] } as never);
  mockSecond.mockResolvedValue({ found: false } as never);
  mockDistil.mockImplementation((q: string) => Promise.resolve({ query: q } as never));
});

describe('the predicate reads the owner’s own words, not a guess at a name', () => {
  it.each([
    'Ask Netai Test 1 to introduce me to Netai Test 2.',
    'I want to be introduced to Netai Test 9 through Netai Test 8.',
    'Arrange a meeting with Netai Test 10 next week.',
    'Can you put me in touch with Ana?',
    'მჭირდება ნინოსთან დაკავშირება — იცნობ თუ არა?',
    'გთხოვ გამაცნო ლევანი.',
  ])('recognises %s', (goal) => {
    expect(goalAsksToReachAPerson(goal)).toBe(true);
  });

  /**
   * AND A TRADE IN THE SAME BREATH STILL GETS ITS SEARCH. „Introduce me to a
   * good plumber" is a trade request wearing an introduction's clothes, and
   * the web can answer it. A rule that swallowed these would be the 17
   * September shape again — a silent guard taking the search away from real
   * goals, unseen for three days.
   */
  it.each([
    'Introduce me to a good plumber in Tbilisi.',
    'Can you put me in touch with a notary?',
    'გთხოვ გამაცნო კარგი ელექტრიკოსი.',
  ])('leaves %s alone, because it names a trade', (goal) => {
    expect(goalAsksToReachAPerson(goal)).toBe(false);
  });

  /** And an ordinary goal is untouched — the overwhelming majority of them. */
  it.each([
    'Find me a good tax accountant in Tbilisi through my contacts.',
    'მჭირდება კარგი ხურო თბილისში.',
    'I have a problem with my apartment.',
  ])('does not fire on %s', (goal) => {
    expect(goalAsksToReachAPerson(goal)).toBe(false);
  });
});

describe('the web search is not merely ignored — it never happens', () => {
  const INTRO = 'Ask Netai Test 1 to introduce me to Netai Test 2.';

  /**
   * THE TEST THAT MATTERS, and the bug it would have caught in my own first
   * version. `webWork` used to be an immediately-invoked async function, so
   * testing the flag where the promise is AWAITED would have skipped nothing:
   * the search — and the name inside it — would already have gone out and only
   * the result would have been dropped.
   */
  it('does not call the search tool at all', async () => {
    await runOpeningSearches('501', INTRO, 'run-1', 900);

    expect(mockWeb).not.toHaveBeenCalled();
  });

  it('does not charge for a search it did not make', async () => {
    await runOpeningSearches('501', INTRO, 'run-1', 900);

    expect(mockCharge).not.toHaveBeenCalled();
  });

  /**
   * THE SECOND CIRCLE STILL RUNS. It is the search that can actually answer
   * „who can introduce me to this person", it never leaves the building, and
   * D315 says it runs when a problem is named.
   */
  it('still runs the second circle, which is the one that can answer this', async () => {
    await runOpeningSearches('501', INTRO, 'run-1', 900);

    expect(mockSecond).toHaveBeenCalled();
  });

  /**
   * A search we CHOSE not to run is not missing. `missing` is what the prompt
   * apologises for, and apologising for a decision would be a false apology.
   */
  it('does not report the web as missing, because nothing failed', async () => {
    const out = await runOpeningSearches('501', INTRO, 'run-1', 900);

    expect(out.missing).toEqual([]);
    expect(out.web).toBeNull();
  });

  /** The control: an ordinary goal still gets both, exactly as before. */
  it('leaves an ordinary trade goal with both searches', async () => {
    await runOpeningSearches('501', 'Find me a good notary in Tbilisi.', 'run-2', 901);

    expect(mockWeb).toHaveBeenCalled();
    expect(mockSecond).toHaveBeenCalled();
  });

  /**
   * THE SECOND DOOR, 23 SEPTEMBER — AND THE FIRST FIX LEFT IT OPEN.
   *
   * Everything above stops the name reaching TAVILY. `distilSearchQuery` runs
   * before all of it and is a model call on OPENAI — a second provider, not
   * the one the conversation runs on — and it was handed the goal text, name
   * included, on every one of these goals. The web half was closed and the
   * name still left the building.
   *
   * These two are the behavioural hold on that. Removing the branch at the
   * call site failed exactly ONE test when I sabotaged it, and that one was a
   * source-text assertion — which is the shape this project keeps finding and
   * keeps deciding is not enough.
   */
  it('sends the goal to no provider at all, not even to be shortened', async () => {
    await runOpeningSearches('501', INTRO, 'run-1', 900);

    expect(mockDistil).not.toHaveBeenCalled();
  });

  it('searches the second circle with the name it built itself', async () => {
    await runOpeningSearches('501', INTRO, 'run-1', 900);

    expect(mockSecond).toHaveBeenCalledWith('501', 'Netai Test 2');
  });

  /** And the control keeps its model call — this changes nothing for a trade goal. */
  it('still shortens an ordinary trade goal with the model', async () => {
    await runOpeningSearches('501', 'Find me a good notary in Tbilisi.', 'run-2', 901);

    expect(mockDistil).toHaveBeenCalled();
  });
});
