jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { holdersOf } from '../reverseTies.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * #8950 (5 Nov): every new fictional seat got reverse ties to the shared fictional
 * accounts; they appeared in almost every plan and shared daily limits.
 */
describe('#8950: no reverse tie between two test seats', () => {
  it('reads the holders of a member without test seats holding a test seat', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await holdersOf(202957);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain(
      'AND NOT (EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = $1::int)',
    );
    expect(sql).toContain('EXISTS (SELECT 1 FROM test_seats th WHERE th.user_id = ua."contactId")');
  });
});
