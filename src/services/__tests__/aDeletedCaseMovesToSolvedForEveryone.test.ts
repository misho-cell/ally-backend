const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockSettle = jest.fn();
jest.mock('../goalResolve.service', () => ({
  settleParticipantThreads: (...a: unknown[]) => mockSettle(...a),
}));
const mockStop = jest.fn();
const mockDismiss = jest.fn();
jest.mock('../goalStop.service', () => ({
  stopGoal: (...a: unknown[]) => mockStop(...a),
  dismissStoppedGoal: (...a: unknown[]) => mockDismiss(...a),
}));
const mockPending = jest.fn();
const mockResolveRequest = jest.fn();
jest.mock('../introduction.service', () => ({
  pendingIntroInMediatorThread: (...a: unknown[]) => mockPending(...a),
  resolveIntroductionRequest: (...a: unknown[]) => mockResolveRequest(...a),
}));
const mockGoal = jest.fn();
jest.mock('../taskStore.service', () => ({ getGoalOnThread: (...a: unknown[]) => mockGoal(...a) }));
const mockTellClosed = jest.fn();
jest.mock('../caseDeclinedByDeleting', () => ({
  tellCaseClosedByDeleting: (...a: unknown[]) => mockTellClosed(...a),
}));
const mockSetStatus = jest.fn();
jest.mock('../threadStatus.service', () => ({
  setThreadStatus: (...a: unknown[]) => mockSetStatus(...a),
}));

import { CaseCloseOutcome, closeCaseInsteadOfDeleting } from '../caseClose.service';
import { Thread } from '../threads.service';

const thread = (over: Partial<Thread>): Thread =>
  ({ id: 61001, type: 'regular', introduction_request_id: null, ...over }) as Thread;

beforeEach(() => {
  jest.resetAllMocks();
  mockSetStatus.mockResolvedValue(undefined);
  mockSettle.mockResolvedValue(undefined);
});

/** #6363 (a), RULE D588 (Giorgi; Misho's yes 20 Oct): „წაშლა" on a case never erases it. */
describe('„წაშლა" on a case', () => {
  it('stops the owner’s goal, settles everybody, and moves it to „მოგვარებული"', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ found: true }] });
    mockGoal.mockResolvedValue({ id: 900, status: 'open' });
    const out = await closeCaseInsteadOfDeleting('7', thread({}));
    expect(out).toBe(CaseCloseOutcome.Closed);
    expect(mockStop).toHaveBeenCalledWith('7', { id: 900, status: 'open' });
    expect(mockDismiss).toHaveBeenCalledWith('7', 61001);
    expect(mockSettle).toHaveBeenCalledWith(900, 61001);
    expect(mockSetStatus).toHaveBeenCalledWith('7', 61001, 'done');
  });

  it('on a go-between’s thread declines the request still waiting and settles it', async () => {
    mockPending.mockResolvedValue(7327);
    const out = await closeCaseInsteadOfDeleting('537', thread({ type: 'incoming_ask' }));
    expect(out).toBe(CaseCloseOutcome.Closed);
    expect(mockResolveRequest).toHaveBeenCalledWith('537', { requestId: 7327 }, 'decline', {
      source: 'button',
    });
    // #7096 / #7097: the go-between is told they closed it; the owner, that they declined.
    expect(mockTellClosed).toHaveBeenCalledWith('537', 61001);
    expect(mockSetStatus).toHaveBeenCalledWith('537', 61001, 'done');
  });

  it('leaves a plain chat with nobody else in it to be erased', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ found: false }] });
    expect(await closeCaseInsteadOfDeleting('7', thread({}))).toBe(CaseCloseOutcome.NotACase);
    expect(mockSetStatus).not.toHaveBeenCalled();
  });
});
