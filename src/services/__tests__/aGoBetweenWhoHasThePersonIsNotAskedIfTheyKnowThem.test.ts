const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { forwardedRequestOpening, incomingRequestOpening } from '../introOpening';
import { goBetweenHasTheTarget } from '../threads.service';

beforeEach(() => jest.resetAllMocks());

/**
 * Tester's report 8 Nov (Giorgi's point 18, C4/C5): Irakli and Nana were asked
 * „do you know Zura / Gigi?" about people saved in their own phonebooks.
 */
describe('a request to a go-between who has the person saved', () => {
  it('asks only whether they will connect them', () => {
    const ka = incomingRequestOpening('ka', 'თორნიკე', 'ზურა', null, false, true);
    expect(ka).toContain('შეძლებ თუ არა დააკავშირო ზურასთან, რომელიც შენს კონტაქტებშია');
    expect(ka).not.toContain('იცნობ თუ არა');
  });

  it('still asks „do you know" when the tie is not confirmed', () => {
    const ka = incomingRequestOpening('ka', 'თორნიკე', 'ზურა', null, false);
    expect(ka).toContain('იცნობ თუ არა ზურას და შეძლებ თუ არა დააკავშირო');
  });

  it('is worded the same way when the request is passed on', () => {
    const ka = forwardedRequestOpening('ka', 'ნანა', 'ერეკლე', 'გიგი', null, true);
    expect(ka).toContain('შეძლებ თუ არა დააკავშირო **გიგისთან**, რომელიც შენს კონტაქტებშია');
  });

  it('is decided by the target’s number in the go-between’s own phonebook', async () => {
    mockQuery.mockResolvedValue({ rows: [{ known: true }] });
    await expect(goBetweenHasTheTarget(7, 11948)).resolves.toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ua."contactId" = $2::int');
    // The digits-only regex reaches SQL as \D, not as a bare D.
    expect(sql).toContain("regexp_replace(ua.phone, '\\D', '', 'g')");
    expect(params).toEqual([11948, 7, 9]);
  });

  it('counts a Netai member’s own number when the request carries none yet (retest 9 Nov)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ known: true }] });
    await goBetweenHasTheTarget(7, 11948);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JOIN "UserPhone" up ON up."userId" = ir.target_user_id');
  });

  it('reads as not known when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    await expect(goBetweenHasTheTarget(7, 11948)).resolves.toBe(false);
  });
});
