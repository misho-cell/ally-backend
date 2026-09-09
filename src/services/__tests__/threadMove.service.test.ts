jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  __esModule: true,
}));

import { query, withTransaction } from '../../db/postgres/client';
import { moveThreads, threadIdsCreatedOn } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

// Ticket 12 Task 59: test chats leave the founder's account by MOVING, in one
// transaction, so the same call with the accounts swapped is the undo.
describe('moveThreads', () => {
  const clientQuery = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation(async (cb) =>
      cb({ query: clientQuery } as unknown as Parameters<typeof cb>[0]),
    );
  });

  it('moves only the threads the source owns, with their messages and goals', async () => {
    clientQuery
      .mockResolvedValueOnce(rows([{ id: 12314 }, { id: 12343 }])) // owned (12999 is not)
      .mockResolvedValueOnce(rows([], 34)) // conversations
      .mockResolvedValueOnce(rows([{ id: 2014 }])) // tasks
      .mockResolvedValueOnce(rows([], 2)); // threads

    const out = await moveThreads('501', '167250', [12314, 12343, 12999]);

    expect(out).toEqual({ moved: [12314, 12343], tasks_moved: [2014], messages_moved: 34 });
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[1][1]).toEqual([[12314, 12343], '167250', '501']);
    expect(clientQuery.mock.calls[2][0]).toContain('UPDATE tasks');
    expect(clientQuery.mock.calls[3][0]).toContain('UPDATE threads');
  });

  it('moves nothing when the source owns none of the ids', async () => {
    clientQuery.mockResolvedValueOnce(rows([]));

    expect(await moveThreads('501', '167250', [1])).toEqual({
      moved: [],
      tasks_moved: [],
      messages_moved: 0,
    });
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty list or a move onto the same account without a transaction', async () => {
    expect(await moveThreads('501', '501', [1])).toEqual({
      moved: [],
      tasks_moved: [],
      messages_moved: 0,
    });
    expect(await moveThreads('501', '167250', [])).toEqual({
      moved: [],
      tasks_moved: [],
      messages_moved: 0,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('threadIdsCreatedOn', () => {
  it('reads one account’s threads of one UTC day', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 12314, title: 'ალპაკის ბეწვის ნართი', is_task: true }]) as never,
    );

    const out = await threadIdsCreatedOn('501', '2026-09-02');

    expect(out).toEqual([{ id: 12314, title: 'ალპაკის ბეწვის ნართი', is_task: true }]);
    expect(mockQuery.mock.calls[0][1]).toEqual(['501', '2026-09-02']);
  });
});
