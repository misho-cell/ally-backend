jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskStore.service', () => ({ getTaskById: jest.fn(), __esModule: true }));
jest.mock('../threadStatus.service', () => ({ setThreadStatus: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({ saveThreadMessage: jest.fn(), __esModule: true }));
jest.mock('../pendingUpdates.service', () => ({ queueFollowUp: jest.fn(), __esModule: true }));
jest.mock('../taskEngine.service', () => ({ wakeTask: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { getTaskById } from '../taskStore.service';
import { setThreadStatus } from '../threadStatus.service';
import { saveThreadMessage } from '../threads.service';
import { queueFollowUp } from '../pendingUpdates.service';
import { wakeTask } from '../taskEngine.service';
import {
  flagGoalQuestion,
  answerGoalQuestion,
  clearGoalQuestionForThread,
  goalQuestionFlaggedSince,
  extractTrailingQuestion,
  adminListGoals,
  GOAL_QUESTION_KIND,
} from '../goalQuestions.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockSetStatus = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const mockSaveMessage = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockQueue = queueFollowUp as jest.MockedFunction<typeof queueFollowUp>;
const mockWake = wakeTask as jest.MockedFunction<typeof wakeTask>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

const OPEN_TASK = {
  id: 1519,
  user_id: '501',
  title: 'ლიკა ოსეფაშვილთან გაცნობა',
  status: 'open',
  thread_id: 9406,
  pending_question: 'რომელი ხიდი ავირჩიო?',
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
  mockQueue.mockResolvedValue({ id: 1 });
  mockSaveMessage.mockResolvedValue(undefined as never);
});

describe('flagGoalQuestion — the blocking question becomes visible', () => {
  it('stores the question, replaces the old held item, queues a typed item, flags the badge', async () => {
    mockGetTask.mockResolvedValue(OPEN_TASK);

    const out = await flagGoalQuestion('501', 1519, 'Lelako-ს გავუგზავნო კითხვა?');

    expect(out.flagged).toBe(true);
    const update = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('pending_question = $3'),
    );
    expect(update?.[1]).toEqual([1519, '501', 'Lelako-ს გავუგზავნო კითხვა?']);
    // One live question per goal: the previous HELD item is deleted first.
    const del = mockQuery.mock.calls.find(([sql]) => (sql as string).includes("status = 'held'"));
    expect(del?.[1]).toEqual(['501', 1519, GOAL_QUESTION_KIND]);
    expect(mockQueue).toHaveBeenCalledWith(
      '501',
      1519,
      GOAL_QUESTION_KIND,
      expect.objectContaining({ question: 'Lelako-ს გავუგზავნო კითხვა?', task_id: 1519 }),
      0,
    );
    expect(mockSetStatus).toHaveBeenCalledWith('501', 9406, 'needs_you', { isTask: true });
  });

  it("refuses another user's goal, a closed goal, and an empty question", async () => {
    mockGetTask.mockResolvedValue({ ...(OPEN_TASK as object), user_id: '7' } as never);
    expect((await flagGoalQuestion('501', 1519, 'q?')).flagged).toBe(false);

    mockGetTask.mockResolvedValue({ ...(OPEN_TASK as object), status: 'closed' } as never);
    expect((await flagGoalQuestion('501', 1519, 'q?')).flagged).toBe(false);

    expect((await flagGoalQuestion('501', 1519, '   ')).flagged).toBe(false);
    expect(mockQueue).not.toHaveBeenCalled();
  });
});

describe("answerGoalQuestion — the owner's answer travels back to the goal", () => {
  it('clears the stored question and wakes the task with the answer', async () => {
    mockGetTask.mockResolvedValue(OPEN_TASK);
    mockWake.mockResolvedValue(true);

    const out = await answerGoalQuestion('501', 1519, 'სალომეს ხიდი ავირჩიოთ');

    expect(out.delivered).toBe(true);
    expect(mockWake).toHaveBeenCalledWith(1519, expect.stringContaining('სალომეს ხიდი ავირჩიოთ'));
    const clear = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('pending_question = NULL'),
    );
    expect(clear).toBeDefined();
  });

  it('falls back to persisting the answer into the goal thread when the wake cannot run', async () => {
    mockGetTask.mockResolvedValue(OPEN_TASK);
    mockWake.mockResolvedValue(false);

    const out = await answerGoalQuestion('501', 1519, 'პასუხი');

    // Delivered stays true: the answer is in the goal's record either way.
    expect(out.delivered).toBe(true);
    expect(mockSaveMessage).toHaveBeenCalledWith(
      9406,
      501,
      'user',
      expect.stringContaining('პასუხი'),
    );
  });

  it("refuses another user's goal and an empty answer", async () => {
    mockGetTask.mockResolvedValue({ ...(OPEN_TASK as object), user_id: '7' } as never);
    expect((await answerGoalQuestion('501', 1519, 'x')).delivered).toBe(false);
    expect((await answerGoalQuestion('501', 1519, ' ')).delivered).toBe(false);
    expect(mockWake).not.toHaveBeenCalled();
  });
});

describe('clearGoalQuestionForThread — showing up in the goal thread answers it', () => {
  it('clears the question and drops the held item for every open task on the thread', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('RETURNING id')) return Promise.resolve(rows([{ id: 1519 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await clearGoalQuestionForThread('501', 9406);

    const del = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('DELETE FROM pending_updates'),
    );
    expect(del?.[1]).toEqual(['501', 1519, GOAL_QUESTION_KIND]);
  });
});

describe('goalQuestionFlaggedSince', () => {
  it('true only when the stored question is newer than the run start', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1519 }]) as never);
    expect(await goalQuestionFlaggedSince(1519, new Date())).toBe(true);

    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect(await goalQuestionFlaggedSince(1519, new Date())).toBe(false);
  });
});

describe('extractTrailingQuestion — the engine fallback payload', () => {
  it('takes the closing paragraph, capped', () => {
    expect(extractTrailingQuestion('found people.\n\nგავუგზავნო კითხვა?')).toBe(
      'გავუგზავნო კითხვა?',
    );
    const long = `intro.\n\n${'ა'.repeat(400)}`;
    expect(extractTrailingQuestion(long).length).toBeLessThanOrEqual(301);
  });
});

describe('adminListGoals — Q-29, the per-goal admin view', () => {
  it('returns wakes_delivered and asks_sent per goal', async () => {
    mockQuery.mockResolvedValue(
      rows([
        {
          id: 1519,
          title: 'გოლი',
          status: 'open',
          brief: 'b',
          pending_question: null,
          pending_question_at: null,
          next_wake_at: null,
          thread_id: 9406,
          created_at: 'x',
          last_activity_at: 'y',
          wakes_delivered: 8,
          asks_sent: 2,
        },
      ]) as never,
    );

    const out = await adminListGoals('501');

    expect(out).toHaveLength(1);
    expect(out[0].wakes_delivered).toBe(8);
    expect(out[0].asks_sent).toBe(2);
  });
});
