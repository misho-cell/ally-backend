jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { recountFamilyBatch } from '../familyRecount.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const OWNER = 2978;

function answer(rows: unknown[]): void {
  mockQuery.mockResolvedValueOnce({ rows, rowCount: rows.length } as never);
}

beforeEach(() => mockQuery.mockReset());

/** #7232 (Misho's yes, 23 Oct): stored family scores are read again with the whole-word rule. */
describe('the family recount', () => {
  it('rescores a surname, keeps a real family word, and touches only label-only rows', async () => {
    answer([{ user_id: OWNER }]);
    answer([
      { user_id: OWNER, contact_phone: 'p1', alias: 'ნიკა ქევხიშვილი', bidirectional: false },
      { user_id: OWNER, contact_phone: 'p2', alias: 'დედა', bidirectional: false },
    ]);
    answer([]);

    const done = await recountFamilyBatch(50);

    expect(done).toEqual({ checked: 2, changed: 1, stillFamily: 1, nextAfterUserId: null });
    const [ownersSql] = mockQuery.mock.calls[0];
    expect(String(ownersSql)).toContain("crs.signals->>'explicit_insight' IS NULL");
    expect(String(ownersSql)).toContain("crs.signals->>'old_ally_status' IS NULL");
    const [updateSql, params] = mockQuery.mock.calls[2];
    expect(String(updateSql)).toContain("AND relationship_type = 'family'");
    expect(params?.[2]).toBe('formal');
  });

  it('gives the next owner to continue after when the batch was full, and none when it was not', async () => {
    answer([{ user_id: 1 }, { user_id: 2 }]);
    answer([]);
    await expect(recountFamilyBatch(2)).resolves.toEqual(
      expect.objectContaining({ nextAfterUserId: 2, checked: 0 }),
    );

    answer([]);
    await expect(recountFamilyBatch(2, 2)).resolves.toEqual({
      checked: 0,
      changed: 0,
      stillFamily: 0,
      nextAfterUserId: null,
    });
    expect(mockQuery.mock.calls[2][1]).toEqual([2, 2]);
  });
});
