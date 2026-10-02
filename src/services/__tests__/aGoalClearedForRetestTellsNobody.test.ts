jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  deleteThread: jest.fn().mockResolvedValue({ deleted: true, cancelledTasks: [12508] }),
}));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  hideGoal: jest.fn().mockResolvedValue('hidden'),
}));

import { query } from '../../db/postgres/client';
import { deleteThread } from '../threads.service';
import { hideGoal } from '../taskStore.service';
import { clearGoalForRetest, ClearRefusal } from '../goalRetestClear.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockDelete = deleteThread as jest.MockedFunction<typeof deleteThread>;
const mockHide = hideGoal as jest.MockedFunction<typeof hideGoal>;

const REASON = 'G-004: Giorgi retests the land-sale lawyer case from a blank page';

function answer(rows: readonly unknown[], rowCount = rows.length): never {
  return { rows, rowCount } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery
    .mockResolvedValueOnce(answer([{ user_id: '118509', thread_id: 28909 }]))
    .mockResolvedValueOnce(answer([], 4))
    .mockResolvedValueOnce(answer([], 0));
});

/**
 * §82, G-004: Giorgi's goal 12508 cleared for a retest. Misho: „წაშალე, ჩუმად
 * დახურე" — delete it, and close the asks with the other people silently.
 */
describe('clearing one goal for a retest', () => {
  it('cancels its open asks with a plain update — no note to any recipient', async () => {
    await clearGoalForRetest(12508, REASON);

    const [sql, params] = mockQuery.mock.calls[1];
    expect(String(sql)).toBe(
      `UPDATE task_asks SET status = 'cancelled' WHERE task_id = $1 AND status = 'sent'`,
    );
    expect(params).toEqual([12508]);
    // Every query is one of the four reads/writes named here; none writes a message.
    for (const [text] of mockQuery.mock.calls) {
      expect(String(text)).not.toMatch(/INSERT INTO conversations/);
    }
  });

  it('deletes the thread as its owner would, then hides the closed goal', async () => {
    const outcome = await clearGoalForRetest(12508, REASON);

    expect(mockDelete).toHaveBeenCalledWith('118509', 28909);
    expect(mockHide).toHaveBeenCalledWith(12508, 'admin:§82', REASON);
    expect(outcome).toEqual({
      ok: true,
      cleared: {
        taskId: 12508,
        owner: '118509',
        threadId: 28909,
        asksCancelled: 4,
        cardsDropped: 0,
        threadDeleted: true,
        hidden: 'hidden',
      },
    });
  });

  it('cancels the asks BEFORE the thread goes, as deleteThread asks of its caller', async () => {
    await clearGoalForRetest(12508, REASON);

    const cancelOrder = mockQuery.mock.invocationCallOrder[1];
    expect(cancelOrder).toBeLessThan(mockDelete.mock.invocationCallOrder[0]);
  });

  it('touches nothing for a goal that does not exist', async () => {
    mockQuery.mockReset().mockResolvedValueOnce(answer([]));

    expect(await clearGoalForRetest(99999, REASON)).toEqual({
      ok: false,
      refusal: ClearRefusal.NoSuchGoal,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('touches nothing without a reason', async () => {
    mockQuery.mockReset();

    expect(await clearGoalForRetest(12508, '  ')).toEqual({
      ok: false,
      refusal: ClearRefusal.BadReason,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
