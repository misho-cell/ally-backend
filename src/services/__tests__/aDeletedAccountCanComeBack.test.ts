const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { RestoreOutcome, restoreDeletedAccount } from '../accountRestore.service';

beforeEach(() => jest.resetAllMocks());

/** Giorgi's account, 26 Oct: deleted outside Netai's erasure, data intact. */
describe('a deleted account can come back', () => {
  it('clears deletedAt and nothing else', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ deleted: true, erased: false }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    expect(await restoreDeletedAccount(118509)).toBe(RestoreOutcome.Restored);
    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('SET "deletedAt" = NULL');
    expect(sql).toContain('AND "deletedAt" IS NOT NULL');
    expect(params).toEqual([118509]);
  });

  it('never restores an account Netai erased, nor one that is not deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ deleted: true, erased: true }] });
    expect(await restoreDeletedAccount(7)).toBe(RestoreOutcome.Erased);
    mockQuery.mockResolvedValueOnce({ rows: [{ deleted: false, erased: false }] });
    expect(await restoreDeletedAccount(7)).toBe(RestoreOutcome.NotDeleted);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await restoreDeletedAccount(7)).toBe(RestoreOutcome.NotFound);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
