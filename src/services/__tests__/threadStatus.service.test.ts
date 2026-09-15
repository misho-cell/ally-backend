jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => {
  const actual = jest.requireActual('../threads.service');
  return { __esModule: true, ...actual, updateThreadStatus: jest.fn() };
});
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadUpdated: jest.fn() }));

import { updateThreadStatus, STATUS_LINES } from '../threads.service';
import { emitThreadUpdated } from '../sse.service';
import { setThreadStatus, endsWithQuestion, runStatus } from '../threadStatus.service';

const mockUpdate = updateThreadStatus as jest.MockedFunction<typeof updateThreadStatus>;
const mockEmit = emitThreadUpdated as jest.MockedFunction<typeof emitThreadUpdated>;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue(undefined);
});

describe('endsWithQuestion', () => {
  it.each([
    ['გინდა გავაგზავნო?', true],
    ['გინდა გავაგზავნო? 😊', true],
    ['**რომელი აირჩიო?**', true],
    ['"შევთავაზო?"', true],
    ['ok?!', true],
    ['მოვძებნე და გავაგზავნე.', false],
    ['დასრულდა ✅', false],
    ['', false],
  ])('%s → %s', (reply, expected) => {
    expect(endsWithQuestion(reply)).toBe(expected);
  });
});

describe('setThreadStatus', () => {
  it('persists the status with its default line and broadcasts thread_updated', async () => {
    await setThreadStatus('42', 7, 'working');

    expect(mockUpdate).toHaveBeenCalledWith(7, 'working', STATUS_LINES.working, undefined);
    expect(mockEmit).toHaveBeenCalledWith('42', {
      id: 7,
      status: 'working',
      status_line: STATUS_LINES.working,
    });
  });

  it('honors an explicit status line and the isTask flag', async () => {
    await setThreadStatus('42', 7, 'waiting', { statusLine: 'გადადებულია', isTask: true });

    expect(mockUpdate).toHaveBeenCalledWith(7, 'waiting', 'გადადებულია', true);
    expect(mockEmit).toHaveBeenCalledWith('42', {
      id: 7,
      status: 'waiting',
      status_line: 'გადადებულია',
      is_task: true,
    });
  });

  it('passes the request ref through to the broadcast when given', async () => {
    await setThreadStatus('42', 7, 'done', { requestRef: 'aaaa-ref' });

    expect(mockEmit).toHaveBeenCalledWith('42', {
      id: 7,
      status: 'done',
      status_line: null,
      request_ref: 'aaaa-ref',
    });
  });

  it('uses a null line for done (no caption on an idle thread)', async () => {
    await setThreadStatus('42', 7, 'done');

    expect(mockUpdate).toHaveBeenCalledWith(7, 'done', null, undefined);
  });

  it('never throws when persistence fails — a status hiccup must not fail the run', async () => {
    mockUpdate.mockRejectedValue(new Error('db down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(setThreadStatus('42', 7, 'failed')).resolves.toBeUndefined();

    expect(mockEmit).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('runStatus — a check that could not run is not a "no"', () => {
  it('waits when the pending-ask check failed, rather than claiming done', () => {
    // This is the bug in one line. Caught into `false`, a database hiccup while
    // asking "is somebody still to answer this" was rendered to the owner as
    // "finished" — the same substitution as telling somebody their note was
    // deleted when it was not.
    expect(runStatus({ asksOwner: false, requestCreated: false, pendingAsk: 'unknown' })).toBe(
      'waiting',
    );
  });

  it('is done only when we actually looked and nobody owes an answer', () => {
    expect(runStatus({ asksOwner: false, requestCreated: false, pendingAsk: false })).toBe('done');
  });

  it('waits when somebody really does owe an answer', () => {
    expect(runStatus({ asksOwner: false, requestCreated: false, pendingAsk: true })).toBe(
      'waiting',
    );
    expect(runStatus({ asksOwner: false, requestCreated: true, pendingAsk: false })).toBe(
      'waiting',
    );
  });

  it('a question for the owner outranks every third-party wait', () => {
    // Ticket 8 Task 2(b): in an engine run the owner being asked is the fact
    // that matters, even while something else is outstanding.
    expect(runStatus({ asksOwner: true, requestCreated: true, pendingAsk: 'unknown' })).toBe(
      'needs_you',
    );
  });
});
