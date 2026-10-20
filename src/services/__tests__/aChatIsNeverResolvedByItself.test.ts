const mockCancelRequests = jest.fn();
jest.mock('../introduction.service', () => ({
  cancelIntroductionRequestsForTask: (...a: unknown[]) => mockCancelRequests(...a),
}));
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
jest.mock('../openAsksAfterSolved', () => ({ offerOpenAsksChoice: jest.fn() }));
const mockSetStatus = jest.fn();
jest.mock('../threadStatus.service', () => ({
  setThreadStatus: (...a: unknown[]) => mockSetStatus(...a),
}));
jest.mock('../sse.service', () => ({ emitChoicesCleared: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ResolveOutcome, resolveGoalOnThread } from '../goalResolve.service';

/**
 * #5282, founder rule D802 (17 Oct): a chat never moves to „მოგვარებული" by
 * itself — only on the owner's „მოგვარდა" or their saying it is solved.
 */
describe('a chat with no goal', () => {
  const THREAD = { id: 51400, status: 'waiting' };

  beforeEach(() => {
    jest.resetAllMocks();
    mockGetThread.mockResolvedValue(THREAD);
    mockGoal.mockResolvedValue(null);
    mockClearChoices.mockResolvedValue(0);
    mockSetStatus.mockResolvedValue(undefined);
  });

  it('is closed by the „მოგვარდა" button, with nothing else to close', async () => {
    expect(await resolveGoalOnThread('184300', 51400)).toEqual({
      outcome: ResolveOutcome.Resolved,
      goal_id: null,
      open_questions: 0,
      thread: THREAD,
    });
    expect(mockSetStatus).toHaveBeenCalledWith('184300', 51400, 'done', { statusLine: null });
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});

describe('the end of a run in a chat with no goal', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );

  it('keeps the chat open unless the owner said it is solved or it once had a goal', () => {
    expect(route).toMatch(
      /const plainChat =\s+thread\.type === 'regular' &&\s+openTask === null &&\s+!becameTask &&\s+!ownerSaysSolved\(message, null\) &&\s+!\(await chatHadAGoal\(threadId\)\);/,
    );
    expect(route).toContain("finalStatus === 'done' || plainChat ? null");
  });

  it('keeps it open after a failed run whose answer was stored, too', () => {
    expect(route).toContain(
      "else void setThreadStatus(userId, threadId, 'waiting', { statusLine: null });",
    );
  });
});
