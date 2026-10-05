jest.mock('../tools/searchByTag', () => ({ __esModule: true, exactMatchesForMany: jest.fn() }));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
// The LOCAL distiller is the real one on purpose: it makes no call and has no
// side effect, and a stub of it would hide the very thing row 253's second
// door is about — that an introduction goal reaches no provider at all.
jest.mock('../searchQuery.service', () => ({
  __esModule: true,
  distilSearchQuery: jest.fn(),
  distilIntroductionLocally: jest.requireActual('../searchQuery.service').distilIntroductionLocally,
}));

import { exactMatchesForMany } from '../tools/searchByTag';
import { logToolCall } from '../toolCallLog.service';
import { findWaysIn } from '../openingSearch.service';

const mockMany = exactMatchesForMany as jest.MockedFunction<typeof exactMatchesForMany>;

/** Every query finds `name`, or nobody when it is null. */
function everyQueryFinds(name: string | null): void {
  mockMany.mockImplementation(
    async (_user, queries) =>
      new Map(queries.map((q) => [q, name === null ? null : { name, phone: '+995555000111' }])),
  );
}
const mockLog = logToolCall as jest.MockedFunction<typeof logToolCall>;

/**
 * Ticket 20 row 108 — the tag searches nobody was counting.
 *
 * Measured 21 September on one build's own log, 15:36-15:50: the product ran
 * 16 tag searches and `tool_call_log` recorded 2. The other fourteen were
 * way-in lookups, which call searchByTag directly and were invisible. So every
 * figure quoted about what that search costs came from a quarter of its calls
 * — and from the cheap quarter, since the model types a trade word while a
 * way-in looks up a web page's title.
 */
beforeEach(() => {
  jest.clearAllMocks();
  everyQueryFinds(null);
});

describe('a way-in lookup is written down', () => {
  it('records ONE row for all names (#959), under a suffix that says it was not the model', async () => {
    await findWaysIn('501', ['Bookkeeping.ge', 'Axel Group'], { threadId: 77, runId: 'r-1' });

    expect(mockMany).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].tool).toBe('search_by_tag:way_in');
    expect(String(mockLog.mock.calls[0][0].input['tag_queries'])).toContain(' | ');
    expect(mockLog.mock.calls[0][0].threadId).toBe(77);
    expect(mockLog.mock.calls[0][0].runId).toBe('r-1');
  });

  it('looks names up a few per pass, and a slow pass loses only its own names', async () => {
    mockMany.mockImplementation(async (_user, queries) =>
      queries.includes('Slow')
        ? new Promise(() => undefined)
        : new Map(queries.map((q) => [q, { name: 'Nino', phone: '+995555000111' }])),
    );

    const out = await findWaysIn('501', ['Some Clinic', 'Other Firm', 'Slow'], { threadId: 77 });

    expect(mockMany).toHaveBeenCalledTimes(2);
    expect(out.get('Some Clinic')).toEqual({ kind: 'first_circle', who: 'Nino' });
    expect(out.get('Slow')).toEqual({ kind: 'unchecked' });
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].result).toEqual({
      found: true,
      count: 2,
      passes: 2,
      timed_out_passes: 1,
    });
  }, 10_000);

  // Row 291: a count, never a contact — these are the owner's own people.
  it('never samples the people, because these are the owner s own contacts', async () => {
    everyQueryFinds('Nino Beridze');

    await findWaysIn('501', ['Some Clinic'], { threadId: 77 });

    expect(mockLog).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(mockLog.mock.calls[0][0]);
    expect(logged).not.toContain('Nino');
    expect(logged).not.toContain('+995');
    expect(mockLog.mock.calls[0][0].result).toEqual({ found: true, count: 1, passes: 1 });
  });

  it('records a lookup the budget cut off, and marks it as cut off', async () => {
    // Never settles, so the race is decided by the budget.
    mockMany.mockReturnValue(new Promise(() => undefined));

    const out = await findWaysIn('501', ['Slow Name'], { threadId: 77 });

    expect(out.get('Slow Name')).toEqual({ kind: 'unchecked' });
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].result).toEqual({ found: false, timed_out: true, passes: 1 });
  }, 10_000);

  it('records a lookup that threw, rather than losing it', async () => {
    mockMany.mockRejectedValue(new Error('pool exhausted'));

    const out = await findWaysIn('501', ['Broken Name'], { threadId: 77 });

    expect(out.get('Broken Name')).toEqual({ kind: 'unchecked' });
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].result).toEqual({ error: 'pool exhausted', passes: 1 });
  });

  /**
   * `tool_call_log.thread_id` is NOT NULL, so a caller without a thread cannot
   * be recorded there. Writing a placeholder would put a row under a thread
   * that did not run it, which is worse than the gap.
   */
  it('writes nothing when there is no thread to attribute it to', async () => {
    await findWaysIn('501', ['Bookkeeping.ge']);
    await findWaysIn('501', ['Bookkeeping.ge'], { runId: 'r-2' });

    expect(mockLog).not.toHaveBeenCalled();
  });

  it('still searches, and still answers, when it cannot log', async () => {
    everyQueryFinds('Nino');

    const out = await findWaysIn('501', ['Some Clinic']);

    expect(out.get('Some Clinic')).toEqual({ kind: 'first_circle', who: 'Nino' });
  });
});
