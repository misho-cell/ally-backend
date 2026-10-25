const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SeatExclusion, setSeatExcluded } from '../excludedHolders.service';

const SEAT = 192038;

beforeEach(() => {
  mockQuery.mockReset();
});

/** Tester 75911: an excluded holder on a fictional seat, so 0fc7629f can be tested. */
describe('a test seat made an account that never vouches', () => {
  it('is written with its own reason, and taken back only by that reason', async () => {
    mockQuery.mockResolvedValue({ rows: [{ user_id: SEAT }] });
    await expect(setSeatExcluded(SEAT, true)).resolves.toBe(SeatExclusion.Set);
    expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO excluded_holders');
    expect(mockQuery.mock.calls[1][1]).toEqual([SEAT, 'test_seat']);

    mockQuery.mockClear();
    await expect(setSeatExcluded(SEAT, false)).resolves.toBe(SeatExclusion.Cleared);
    expect(mockQuery.mock.calls[1][0]).toContain('AND reason = $2');
    expect(mockQuery.mock.calls[1][1]).toEqual([SEAT, 'test_seat']);
  });

  it('is refused for an account that is not a test seat, touching nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(setSeatExcluded(SEAT, true)).resolves.toBe(SeatExclusion.NotATestSeat);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('is a PUT behind the admin router, a refusal answered with 400', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const handler = routes.slice(routes.indexOf("'/test-accounts/:id/excluded'"));
    expect(routes).toContain("adminRouter.put(\n  '/test-accounts/:id/excluded'");
    expect(handler).toContain('await setSeatExcluded(seatId, req.body.excluded === true)');
    expect(handler.indexOf('res.status(400)')).toBeLessThan(handler.indexOf('res.status(200)'));
  });
});
