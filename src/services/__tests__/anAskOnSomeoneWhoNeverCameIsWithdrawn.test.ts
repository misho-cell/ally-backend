const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { withdrawAsksOnNonMembers } from '../asksOnNonMembers.service';

const OPEN = [
  { id: 1, to_user_id: 1664, task_id: 10 },
  { id: 2, to_user_id: 1664, task_id: 11 },
  { id: 3, to_user_id: 523, task_id: 10 },
];

beforeEach(() => jest.resetAllMocks());

/** #7827: asks sent before #7235 still sit on people who never typed in Netai. */
describe('an ask on someone who never came is withdrawn, on Misho’s word', () => {
  it('counts on a dry run and changes nothing', async () => {
    mockQuery.mockResolvedValue({ rows: OPEN });
    expect(await withdrawAsksOnNonMembers(true)).toEqual({
      dry_run: true,
      open_asks: 3,
      people: 2,
      goals: 2,
      withdrawn: 0,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain("ta.status = 'sent' AND NOT");
    expect(sql).toContain('search_activity');
    expect(params).toEqual([expect.any(Number)]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('withdraws exactly the asks it found, still open, on a real run', async () => {
    mockQuery.mockResolvedValueOnce({ rows: OPEN }).mockResolvedValueOnce({ rowCount: 3 });
    expect((await withdrawAsksOnNonMembers(false)).withdrawn).toBe(3);
    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("SET status = 'cancelled' WHERE id = ANY($1::int[]) AND status = 'sent'");
    expect(params).toEqual([[1, 2, 3]]);
  });

  it('writes nothing when there is nothing open', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect((await withdrawAsksOnNonMembers(false)).withdrawn).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('has its own admin route that needs dry_run', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("adminRouter.post('/asks/withdraw-non-members'");
  });
});
