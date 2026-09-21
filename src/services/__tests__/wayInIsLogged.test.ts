jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTag: jest.fn() }));
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
jest.mock('../searchQuery.service', () => ({ __esModule: true, distilSearchQuery: jest.fn() }));

import { searchByTag } from '../tools/searchByTag';
import { logToolCall } from '../toolCallLog.service';
import { findWaysIn } from '../openingSearch.service';

const mockTag = searchByTag as jest.MockedFunction<typeof searchByTag>;
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
  mockTag.mockResolvedValue({ found: false } as never);
});

describe('a way-in lookup is written down', () => {
  it('records one row per name, under a suffix that says it was not the model', async () => {
    await findWaysIn('501', ['Bookkeeping.ge', 'Axel Group'], { threadId: 77, runId: 'r-1' });

    expect(mockLog).toHaveBeenCalledTimes(2);
    const tools = mockLog.mock.calls.map((c) => c[0].tool);
    expect(tools).toEqual(['search_by_tag:way_in', 'search_by_tag:way_in']);
    const queries = mockLog.mock.calls.map((c) => c[0].input['tag_query']);
    expect(queries.sort()).toEqual(['Axel Group', 'Bookkeeping.ge']);
    expect(mockLog.mock.calls[0][0].threadId).toBe(77);
    expect(mockLog.mock.calls[0][0].runId).toBe('r-1');
  });

  it('never samples the result, because these are the owner s own contacts', async () => {
    mockTag.mockResolvedValue({
      found: true,
      results: [{ name: 'Nino Beridze', phone: '+995...' }],
    } as never);

    await findWaysIn('501', ['Some Clinic'], { threadId: 77 });

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].resultSample).toBeUndefined();
  });

  it('records a lookup the budget cut off, and marks it as cut off', async () => {
    // Never settles, so the race is decided by the budget.
    mockTag.mockReturnValue(new Promise<object>(() => undefined));

    const out = await findWaysIn('501', ['Slow Name'], { threadId: 77 });

    expect(out.get('Slow Name')).toEqual({ kind: 'unchecked' });
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].result).toEqual({ found: false, timed_out: true });
  }, 10_000);

  it('records a lookup that threw, rather than losing it', async () => {
    mockTag.mockRejectedValue(new Error('pool exhausted'));

    const out = await findWaysIn('501', ['Broken Name'], { threadId: 77 });

    expect(out.get('Broken Name')).toEqual({ kind: 'unchecked' });
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].result).toEqual({ error: 'pool exhausted' });
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
    mockTag.mockResolvedValue({ found: true, results: [{ name: 'Nino' }] } as never);

    const out = await findWaysIn('501', ['Some Clinic']);

    expect(out.get('Some Clinic')).toEqual({ kind: 'first_circle', who: 'Nino' });
  });
});
