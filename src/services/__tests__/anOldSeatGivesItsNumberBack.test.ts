const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: (fn: (c: unknown) => unknown) => fn({ query: mockClientQuery }),
}));
const mockErase = jest.fn();
jest.mock('../privacyRights.service', () => ({
  __esModule: true,
  deleteMyAccount: (...a: unknown[]) => mockErase(...a),
  NUMBER_RETAINED_NOTE: 'number kept',
}));

import { deleteTestSeat, SEAT_NUMBER_RELEASED_NOTE } from '../testSeatDelete.service';

beforeEach(() => {
  jest.resetAllMocks();
  mockErase.mockResolvedValue({
    userId: 5,
    rowsDeleted: {},
    retained: ['ledgers', 'number kept'],
    dryRun: false,
  });
  mockClientQuery.mockResolvedValue({ rowCount: 2, rows: [] });
});

/** #8581 (the tester's 80985 / 81002): old fictional seats hold the reserved numbers. */
describe('deleting an old test seat', () => {
  it('refuses an account that is not a test seat, before anything runs', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await deleteTestSeat(5, false)).toEqual({
      ok: false,
      refusal: 'not a test seat — refused',
    });
    expect(mockErase).not.toHaveBeenCalled();
  });

  it('refuses a seat on a number outside the fictional ranges', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: '+995555123456' }] });
    const out = await deleteTestSeat(5, false);
    expect(out.ok).toBe(false);
    expect(mockErase).not.toHaveBeenCalled();
  });

  it('only reports on a dry run', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: '+12025550142' }] });
    const out = await deleteTestSeat(5, true);
    expect(out).toMatchObject({ ok: true, dryRun: true, numbersFreed: 1, seatEntriesRemoved: 0 });
    expect(mockErase).toHaveBeenCalledWith('5', true);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('erases the seat, lifts its opt-out and clears only other seats’ entries for its number', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: '+12025550142' }] });
    const out = await deleteTestSeat(5, false);
    expect(out).toMatchObject({ ok: true, dryRun: false, numbersFreed: 1, seatEntriesRemoved: 4 });
    const sqls = mockClientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toContain(
      "FROM phone_optouts WHERE phone_digits = ANY($1::text[]) AND reason = 'account_deleted'",
    );
    expect(sqls[1]).toContain('"contactId" IN (SELECT user_id FROM test_seats)');
    expect(sqls[2]).toContain('"contactId" IN (SELECT user_id FROM test_seats)');
    expect(sqls[3]).toContain('DELETE FROM test_seats WHERE user_id = $1');
    expect(mockClientQuery.mock.calls[0][1]).toEqual([['12025550142']]);
  });

  it('says on the dry run that the seat’s number is released, not kept (81214)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: '+12025550142' }] });
    const out = await deleteTestSeat(5, true);
    expect(out.ok && out.erasure.retained).toEqual(['ledgers', SEAT_NUMBER_RELEASED_NOTE]);
  });
});
