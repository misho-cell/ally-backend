jest.mock('../taskStore.service', () => ({
  ...jest.requireActual('../taskStore.service'),
  getOpenTaskByThread: jest.fn(),
}));

import type Anthropic from '@anthropic-ai/sdk';
import { getOpenTaskByThread } from '../taskStore.service';
import { waitingItemsToDeliver } from '../chat.service';
import type { PendingItemInput } from '../pendingMessages';

const mockGoal = getOpenTaskByThread as jest.MockedFunction<typeof getOpenTaskByThread>;
const THREAD = 35305;

function calledTool(name: string): Anthropic.MessageParam[] {
  return [
    { role: 'user', content: 'ვინ იყიდის ბუღალტრულ პროგრამას?' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name, input: {} }] },
  ];
}

/**
 * The tester's 1120 (35305): a long answer that was not about goals ended in
 * „კიდევ გელოდება: 2 შეკითხვა". Other goals come up only when the owner asks.
 */
const OWN: PendingItemInput = { kind: 'debrief', task_id: 7, payload: {} };
const OTHER: PendingItemInput = { kind: 'debrief', task_id: 8, payload: {} };
const SUMMARY: PendingItemInput = { kind: 'more_pending', task_id: null, payload: { count: 2 } };
const ALL = [OWN, OTHER, SUMMARY];

describe('the waiting items', () => {
  beforeEach(() => mockGoal.mockReset());

  it('wait under an answer that never looked at goals, outside a goal', async () => {
    mockGoal.mockResolvedValue(null);
    expect(await waitingItemsToDeliver(ALL, false, THREAD, calledTool('search_by_tag'))).toEqual(
      [],
    );
  });

  it('all go out when the run looked at the goals or the inbox', async () => {
    mockGoal.mockResolvedValue(null);
    expect(await waitingItemsToDeliver(ALL, false, THREAD, calledTool('get_my_tasks'))).toEqual(
      ALL,
    );
    expect(await waitingItemsToDeliver(ALL, false, THREAD, calledTool('check_my_inbox'))).toEqual(
      ALL,
    );
  });

  /** The tester's 1121 (35482): the summary of other goals came under this goal's answer. */
  it('in a goal’s own conversation, only that goal’s items go out', async () => {
    mockGoal.mockResolvedValue({ id: 7 } as Awaited<ReturnType<typeof getOpenTaskByThread>>);
    expect(await waitingItemsToDeliver(ALL, false, THREAD, calledTool('search_by_tag'))).toEqual([
      OWN,
    ]);
  });

  it('all go out on a run the system started', async () => {
    expect(await waitingItemsToDeliver(ALL, true, THREAD, [])).toEqual(ALL);
    expect(mockGoal).not.toHaveBeenCalled();
  });

  it('all go out when the goal cannot be read, rather than never', async () => {
    mockGoal.mockRejectedValue(new Error('timeout'));
    expect(await waitingItemsToDeliver(ALL, false, THREAD, [])).toEqual(ALL);
  });
});
