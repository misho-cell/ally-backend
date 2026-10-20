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

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RESOLVED_BY_OWNER_NOTE,
  ResolveOutcome,
  resolveGoalOnThread,
} from '../goalResolve.service';

/** 4925 (Giorgi, 13 Oct): the design's „მოგვარდა" button in every chat. */
const THREAD = { id: 51300, status: 'waiting' };

beforeEach(() => {
  jest.resetAllMocks();
  mockGetThread.mockResolvedValue(THREAD);
  mockUpdateTask.mockResolvedValue(true);
  mockOffer.mockResolvedValue(0);
  mockClearChoices.mockResolvedValue(0);
  mockSetStatus.mockResolvedValue(undefined);
});

describe('the owner taps „მოგვარდა"', () => {
  it('closes their open goal as finished and marks the conversation done', async () => {
    mockGoal.mockResolvedValue({ id: 900, status: 'open' });
    const out = await resolveGoalOnThread('184300', 51300);
    expect(mockUpdateTask).toHaveBeenCalledWith(
      '184300',
      900,
      'closed',
      RESOLVED_BY_OWNER_NOTE,
      'finished',
    );
    expect(mockSetStatus).toHaveBeenCalledWith('184300', 51300, 'done');
    expect(mockCleared).toHaveBeenCalledWith('184300', 51300);
    expect(out).toEqual({
      outcome: ResolveOutcome.Resolved,
      goal_id: 900,
      open_questions: 0,
      thread: THREAD,
    });
  });

  it('closes a paused goal too: the owner says it is solved', async () => {
    mockGoal.mockResolvedValue({ id: 901, status: 'paused' });
    expect((await resolveGoalOnThread('184300', 51300)).outcome).toBe(ResolveOutcome.Resolved);
  });

  it('leaves questions still out to the owner, with the keep-or-close card (row 311)', async () => {
    mockGoal.mockResolvedValue({ id: 900, status: 'open' });
    mockOffer.mockResolvedValue(2);
    const out = await resolveGoalOnThread('184300', 51300);
    expect(mockOffer).toHaveBeenCalledWith(900, 51300, 184300);
    expect(out).toMatchObject({ open_questions: 2 });
  });
});

describe('what it refuses', () => {
  it('a thread that is not the caller’s', async () => {
    mockGetThread.mockResolvedValue(null);
    expect(await resolveGoalOnThread('184300', 51300)).toEqual({
      outcome: ResolveOutcome.NotFound,
    });
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('a goal already closed', async () => {
    mockGoal.mockResolvedValue({ id: 902, status: 'closed' });
    expect((await resolveGoalOnThread('184300', 51300)).outcome).toBe(ResolveOutcome.NoOpenGoal);
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});

describe('POST /threads/:id/resolve', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );
  const fn = route.slice(
    route.indexOf("  '/:id/resolve',"),
    route.indexOf('threadsRouter.use(requireSubscriptionUnlessAnswering)'),
  );

  it('sits above the subscription gate, like stop', () => {
    expect(fn).toContain('resolveGoalOnThread(userId, Number(req.params.id))');
  });

  it('answers 404, 409 with a code, and never a database error', () => {
    expect(fn).toContain('res.status(404)');
    expect(fn).toContain('res.status(409).json({ success: false, error: NO_GOAL_TO_RESOLVE })');
    expect(fn).toContain("error: 'სერვერის შეცდომა'");
  });
});
