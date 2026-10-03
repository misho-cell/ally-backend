jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../pendingUpdates.service', () => ({ __esModule: true, queueFollowUp: jest.fn() }));
jest.mock('../threadStatus.service', () => ({ __esModule: true, setThreadStatus: jest.fn() }));
jest.mock('../threads.service', () => ({ __esModule: true, saveThreadMessage: jest.fn() }));
jest.mock('../taskStore.service', () => ({ __esModule: true, getTaskById: jest.fn() }));

import { query } from '../../db/postgres/client';
import { queueFollowUp } from '../pendingUpdates.service';
import { getTaskById } from '../taskStore.service';
import { flagGoalQuestion } from '../goalQuestions.service';
import { renderPendingMessage } from '../pendingMessages';
import { isApproveTap } from '../chat.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueue = queueFollowUp as jest.MockedFunction<typeof queueFollowUp>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

/**
 * Board #102 (plate F3): the reminder about a plan waiting for its yes asked
 * „approve or change?" with only „answer now" / „later" under it.
 */
describe('a waiting plan’s reminder card', () => {
  const card = (planWaiting: boolean, language: 'ka' | 'en' = 'ka') =>
    renderPendingMessage(
      {
        kind: 'goal_question',
        task_id: 12001,
        payload: {
          goal_title: 'ბუღალტერი',
          question: 'გეგმას ვამტკიცებთ თუ შევცვალოთ?',
          instruction: 'i',
          plan_waiting: planWaiting,
        },
      },
      language,
    );

  it('carries the plan card’s own approve and change buttons', () => {
    expect(card(true)?.choices).toEqual(['ვამტკიცებ', 'შევცვალოთ', 'მოგვიანებით']);
    expect(card(true, 'en')?.choices).toEqual(['I approve', 'Change it', 'Later']);
  });

  it('whose approve label is the one the server approves on (row 323)', () => {
    const approve = card(true)?.choices[0] ?? '';
    expect(isApproveTap(approve)).toBe(true);
  });

  it('tells the run the server handles the approve tap', () => {
    expect(card(true)?.instruction).toContain('handled by the server');
  });

  it('keeps answer now / later for a question that is not about a waiting plan', () => {
    expect(card(false)?.choices).toEqual(['ვუპასუხებ ახლა', 'მოგვიანებით']);
  });
});

describe('the flag says whether the goal’s plan is waiting', () => {
  const task = (planProposed: object | null) =>
    ({
      id: 12001,
      user_id: '41',
      status: 'open',
      title: 'ბუღალტერი',
      pending_question: null,
      thread_id: null,
      plan_proposed: planProposed,
    }) as never;

  it('marks plan_waiting when a proposed plan has no yes yet', async () => {
    mockTask.mockResolvedValue(task({ routes: [] }));
    await flagGoalQuestion('41', 12001, 'გეგმას ვამტკიცებთ?');
    expect(mockQueue.mock.calls[0][3]).toMatchObject({ plan_waiting: true });
  });

  it('does not mark it when no plan is waiting', async () => {
    mockTask.mockResolvedValue(task(null));
    await flagGoalQuestion('41', 12001, 'რომელ ქალაქში?');
    expect(mockQueue.mock.calls[0][3]).toMatchObject({ plan_waiting: false });
  });
});
