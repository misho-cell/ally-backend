import { query, withTransaction } from '../../db/postgres/client';
import { deleteEmptyAccount, EmptyDeleteOutcome } from '../emptyAccount.service';

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTx = withTransaction as jest.MockedFunction<typeof withTransaction>;
const client = { query: jest.fn() };

const COLUMNS = [
  { table_name: 'UserPhone', column_name: 'userId', data_type: 'integer' },
  { table_name: 'tasks', column_name: 'user_id', data_type: 'text' },
  { table_name: 'test_seats', column_name: 'user_id', data_type: 'integer' },
];

/** §120 (Misho, 9 Oct): the seat clash's two empty accounts, and never anybody else. */
describe('deleting an empty account', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.mockImplementation(async (cb) => cb(client as never));
  });

  it('deletes and logs an account that no table holds', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 181485 }] } as never)
      .mockResolvedValueOnce({ rows: COLUMNS } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(deleteEmptyAccount(181485)).resolves.toEqual({
      outcome: EmptyDeleteOutcome.Deleted,
    });
    const [sql, params] = mockQuery.mock.calls[2];
    // Each column in its own type, so its index is used.
    expect(String(sql)).toContain('"UserPhone" WHERE "userId" = $1::int');
    expect(String(sql)).toContain('"tasks" WHERE "user_id" = $2::text');
    expect(params).toEqual([181485, '181485']);
    expect(String(client.query.mock.calls[0][0])).toBe('DELETE FROM "User" WHERE id = $1');
    expect(String(client.query.mock.calls[1][0])).toContain('INSERT INTO erasure_log');
  });

  it('refuses, naming the table, when anything holds it — a test seat included', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 181646 }] } as never)
      .mockResolvedValueOnce({ rows: COLUMNS } as never)
      .mockResolvedValueOnce({ rows: [{ at: 2 }] } as never);
    await expect(deleteEmptyAccount(181646)).resolves.toEqual({
      outcome: EmptyDeleteOutcome.NotEmpty,
      holding: ['test_seats'],
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it('says not found for an unknown id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(deleteEmptyAccount(9)).resolves.toEqual({ outcome: EmptyDeleteOutcome.NotFound });
    expect(mockTx).not.toHaveBeenCalled();
  });
});
