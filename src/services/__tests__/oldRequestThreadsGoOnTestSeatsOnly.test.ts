const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockDelete = jest.fn();
jest.mock('../threads.service', () => ({
  deleteThread: (...a: unknown[]) => mockDelete(...a),
}));

import { deleteTestSeatRequestThreads } from '../oldRequestThreads.service';

/** #5415 / G-067 step one: test seats' outgoing-request threads only, never one a goal runs in. */
describe('deleting the old request threads, step one', () => {
  beforeEach(() => jest.resetAllMocks());

  it('reads only test seats’ outgoing-request threads with no live goal', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await deleteTestSeatRequestThreads();
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('JOIN test_seats ts ON ts.user_id = t.user_id');
    expect(sql).toContain("t.type = 'outgoing_request'");
    expect(sql).toContain("k.status IN ('open', 'paused')");
  });

  it('deletes each through the owner’s own delete and counts what went', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 11, user_id: 7 },
        { id: 12, user_id: 8 },
      ],
    });
    mockDelete
      .mockResolvedValueOnce({ deleted: true, cancelledTasks: [] })
      .mockResolvedValueOnce({ deleted: false, cancelledTasks: [] });
    expect(await deleteTestSeatRequestThreads()).toEqual({ found: 2, deleted: 1 });
    expect(mockDelete).toHaveBeenCalledWith('7', 11);
    expect(mockDelete).toHaveBeenCalledWith('8', 12);
  });
});
