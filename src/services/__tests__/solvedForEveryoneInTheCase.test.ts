const mockGetThread = jest.fn();
const mockClearChoices = jest.fn();
jest.mock('../threads.service', () => ({
  getThread: (...a: unknown[]) => mockGetThread(...a),
  clearStoredChoices: (...a: unknown[]) => mockClearChoices(...a),
}));
const mockGoal = jest.fn();
const mockUpdateTask = jest.fn();
jest.mock('../taskStore.service', () => ({
  getGoalOnThread: (...a: unknown[]) => mockGoal(...a),
  updateTask: (...a: unknown[]) => mockUpdateTask(...a),
}));
const mockOffer = jest.fn();
jest.mock('../openAsksAfterSolved', () => ({
  offerOpenAsksChoice: (...a: unknown[]) => mockOffer(...a),
}));
const mockSetStatus = jest.fn();
jest.mock('../threadStatus.service', () => ({
  setThreadStatus: (...a: unknown[]) => mockSetStatus(...a),
}));
const mockCleared = jest.fn();
jest.mock('../sse.service', () => ({
  emitChoicesCleared: (...a: unknown[]) => mockCleared(...a),
}));

const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { resolveGoalOnThread } from '../goalResolve.service';

const OWNER = '184300';
const OWNER_THREAD = 51300;

beforeEach(() => {
  jest.resetAllMocks();
  mockGetThread.mockResolvedValue({ id: OWNER_THREAD, status: 'waiting' });
  mockGoal.mockResolvedValue({ id: 900, status: 'open' });
  mockUpdateTask.mockResolvedValue(true);
  mockOffer.mockResolvedValue(0);
  mockClearChoices.mockResolvedValue(0);
  mockSetStatus.mockResolvedValue(undefined);
});

/** #6363, RULE D588 (1) (Giorgi): the owner's „მოგვარდა" settles the case for everybody in it. */
describe('the owner’s „მოგვარდა" reaches every participant', () => {
  it('moves each helper’s and go-between’s conversation to „მოგვარებული"', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 61001, user_id: 701 },
        { id: 61002, user_id: 702 },
      ],
    });
    await resolveGoalOnThread(OWNER, OWNER_THREAD);
    expect(mockSetStatus).toHaveBeenCalledWith(OWNER, OWNER_THREAD, 'done');
    expect(mockSetStatus).toHaveBeenCalledWith('701', 61001, 'done');
    expect(mockSetStatus).toHaveBeenCalledWith('702', 61002, 'done');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('ta.task_id = $1');
    expect(String(sql)).toContain('ir.requester_task_id = $1');
    expect(params).toEqual([900, OWNER_THREAD, 100]);
  });

  it('still resolves the owner’s case when the participants cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('timeout'));
    const out = await resolveGoalOnThread(OWNER, OWNER_THREAD);
    expect(out.outcome).toBe('resolved');
    expect(mockSetStatus).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
