const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SeatPhoneRefusal, addSeatPhone } from '../seatPhones.service';

const SEAT = 192078;
const SECOND = '+12025550142';

beforeEach(() => mockQuery.mockReset());

/** Tester 75919 (#7630): one person on two numbers, on a fictional seat. */
describe('a test seat given a second number', () => {
  it('gets a reserved fictional number nobody holds', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ phones: 2 }] });
    await expect(addSeatPhone(SEAT, SECOND)).resolves.toEqual({ ok: true, seat: SEAT, phones: 2 });
    expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO "UserPhone"');
    expect(mockQuery.mock.calls[2][1]).toEqual([SECOND, '2025550142', '+1', SEAT]);
  });

  it('refuses a real number before reading anything', async () => {
    await expect(addSeatPhone(SEAT, '+995599123456')).resolves.toEqual({
      ok: false,
      refusal: SeatPhoneRefusal.NotAFictionalNumber,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses an account that is not a test seat, and a number already held', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(addSeatPhone(SEAT, SECOND)).resolves.toMatchObject({
      refusal: SeatPhoneRefusal.NotATestSeat,
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: SEAT }] })
      .mockResolvedValueOnce({ rows: [{ id: 9 }] });
    await expect(addSeatPhone(SEAT, SECOND)).resolves.toMatchObject({
      refusal: SeatPhoneRefusal.Taken,
    });
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('is a POST behind the admin router, a refusal answered with 400', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const handler = routes.slice(routes.indexOf("'/test-accounts/:id/phones'"));
    expect(routes).toContain("adminRouter.post(\n  '/test-accounts/:id/phones'");
    expect(handler).toContain('await addSeatPhone(seatId, String(req.body.phone))');
    expect(handler.indexOf('res.status(400)')).toBeLessThan(handler.indexOf('res.status(201)'));
  });
});
