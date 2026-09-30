jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  ...jest.requireActual('../taskStore.service'),
  getTaskById: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { getTaskById } from '../taskStore.service';
import { deliverAnswersWhenFree } from '../taskEngine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;

const OWED = {
  id: 5481,
  task_id: 11155,
  answer: 'Yes, I know one: Baxva Gamogonili.',
  from_name: 'Netai Test 50',
  task_status: 'open',
  task_thread_id: 26700,
  ask_thread_id: 26702,
};

function owedRows(rows: unknown[]): void {
  mockQuery.mockImplementation((sql: string) =>
    Promise.resolve({
      rows: String(sql).includes('ta.task_id = $1') ? rows : [],
      rowCount: rows.length,
    } as never),
  );
}

async function fire(): Promise<void> {
  jest.advanceTimersByTime(6_000);
  // Let the timer's async body run to its end.
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/**
 * Row 322: a live answer wake that found the thread busy used to be left for
 * the five-minute sweep. It is retried on the six-second rhythm instead, and
 * each attempt re-reads what is owed.
 */
describe('an answer whose wake found the thread busy is retried, not left', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it('does nothing once another run has delivered everything', async () => {
    owedRows([]);
    deliverAnswersWhenFree(11155);
    await fire();
    expect(mockTask).not.toHaveBeenCalled();
  });

  it('tries to wake the goal when an answer is still owed', async () => {
    owedRows([OWED]);
    mockTask.mockResolvedValue(null);
    deliverAnswersWhenFree(11155);
    await fire();
    expect(mockTask).toHaveBeenCalledWith(11155);
  });

  it('marks nothing delivered when the wake did not run, and tries again', async () => {
    owedRows([OWED]);
    mockTask.mockResolvedValue(null);
    deliverAnswersWhenFree(11155);
    await fire();
    const marked = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('wake_delivered_at = NOW()'),
    );
    expect(marked).toHaveLength(0);
    await fire();
    expect(mockTask).toHaveBeenCalledTimes(2);
  });

  it('reads what is owed with a limit and a timeout', async () => {
    owedRows([]);
    deliverAnswersWhenFree(11155);
    await fire();
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/LIMIT \$2/);
    expect(params).toEqual([11155, 1]);
    expect(timeout).toBeGreaterThan(0);
  });
});
