jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));
jest.mock('../searchOutcome.service', () => ({
  __esModule: true,
  ...jest.requireActual('../searchOutcome.service'),
  recordSearchOutcome: jest.fn().mockResolvedValue(true),
}));

import { recordSearchOutcome } from '../searchOutcome.service';
import { markSearchSent, noteSearchResults } from '../chat.service';

const record = recordSearchOutcome as jest.MockedFunction<typeof recordSearchOutcome>;
const USER = '501';
const PHONE = '+995555000111';
const OTHER = '+995555000999';

function searchReturning(phone: string) {
  return { results: [{ phone }] };
}

beforeEach(() => jest.clearAllMocks());

/**
 * Row 225 — „Netai never writes down whether a search actually helped."
 *
 * The link between a search and the message it led to lived in a map keyed by
 * RUN, and `clearRunState` drops it at both run exits. So the only send it
 * could ever explain was one that happened in the same turn as the search —
 * and that is not how people use this. They search, read the answer, and say
 * „yes, write to her" in the next turn.
 *
 * Measured on tool_call_log before any of this was written:
 *
 *     successful ask_contact calls                  55
 *     …in the SAME run as a search                   5
 *     …whose THREAD held an earlier search          42
 *
 * Five out of fifty-five is what the old map could reach.
 */
describe('a send in a later turn still finds the search that produced it', () => {
  it('records the outcome when the send is a run later, in the same thread', async () => {
    noteSearchResults('run-1', 77, searchReturning(PHONE), 4242);

    await markSearchSent('run-2', USER, [PHONE], 4242);

    expect(record).toHaveBeenCalledTimes(1);
    const call = record.mock.calls[0][0];
    expect(call.searchId).toBe(77);
    expect(call.outcome).toBe('sent');
    // The wider scope is named in the row, so the two kinds of link can be
    // told apart in the data afterwards rather than blurred into one number.
    expect(call.reason).toContain('later run');
    // An inference never overwrites a rung the person actually climbed.
    expect(call.onlyIfUnset).toBe(true);
  });

  /**
   * THE PROPERTY THAT KEEPS THIS A MEASUREMENT AND NOT A GUESS.
   *
   * The cheap version of this fix would say „a send happened in a thread that
   * once held a search, so mark that search sent". It would reach more rows
   * and it would be inference wearing the clothes of evidence — in the one
   * table whose entire purpose is to record what actually worked.
   *
   * The thread only widens WHICH searches are considered. The phone still has
   * to match.
   */
  it('records nothing when the person was never in any search’s results', async () => {
    noteSearchResults('run-1', 78, searchReturning(PHONE), 5151);

    await markSearchSent('run-2', USER, [OTHER], 5151);

    expect(record).not.toHaveBeenCalled();
  });

  it('records nothing when the send is in a different thread', async () => {
    noteSearchResults('run-1', 79, searchReturning(PHONE), 6161);

    await markSearchSent('run-2', USER, [PHONE], 6262);

    expect(record).not.toHaveBeenCalled();
  });

  it('still prefers this run’s own search, and says so with the narrower reason', async () => {
    noteSearchResults('run-a', 80, searchReturning(PHONE), 7171);
    noteSearchResults('run-b', 81, searchReturning(PHONE), 7171);

    await markSearchSent('run-b', USER, [PHONE], 7171);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].searchId).toBe(81);
    expect(record.mock.calls[0][0].reason).not.toContain('later run');
  });

  it('needs a thread to reach past the run, and does nothing without one', async () => {
    noteSearchResults('run-1', 82, searchReturning(PHONE), 8181);

    await markSearchSent('run-2', USER, [PHONE], null);

    expect(record).not.toHaveBeenCalled();
  });
});
