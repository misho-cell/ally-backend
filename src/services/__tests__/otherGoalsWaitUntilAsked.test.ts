jest.mock('../taskStore.service', () => ({
  ...jest.requireActual('../taskStore.service'),
  getOpenTaskByThread: jest.fn(),
}));

import type Anthropic from '@anthropic-ai/sdk';
import { getOpenTaskByThread } from '../taskStore.service';
import { waitingItemsWanted } from '../chat.service';

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
describe('the waiting items', () => {
  beforeEach(() => mockGoal.mockReset());

  it('wait under an answer that never looked at goals, outside a goal', async () => {
    mockGoal.mockResolvedValue(null);
    expect(await waitingItemsWanted(false, THREAD, calledTool('search_by_tag'))).toBe(false);
  });

  it('go out when the run looked at the goals or the inbox', async () => {
    mockGoal.mockResolvedValue(null);
    expect(await waitingItemsWanted(false, THREAD, calledTool('get_my_tasks'))).toBe(true);
    expect(await waitingItemsWanted(false, THREAD, calledTool('check_my_inbox'))).toBe(true);
  });

  it('go out in a goal’s own conversation', async () => {
    mockGoal.mockResolvedValue({ id: 1 } as Awaited<ReturnType<typeof getOpenTaskByThread>>);
    expect(await waitingItemsWanted(false, THREAD, calledTool('search_by_tag'))).toBe(true);
  });

  it('go out on a run the system started', async () => {
    expect(await waitingItemsWanted(true, THREAD, [])).toBe(true);
    expect(mockGoal).not.toHaveBeenCalled();
  });

  it('go out when the goal cannot be read, rather than never', async () => {
    mockGoal.mockRejectedValue(new Error('timeout'));
    expect(await waitingItemsWanted(false, THREAD, [])).toBe(true);
  });
});
