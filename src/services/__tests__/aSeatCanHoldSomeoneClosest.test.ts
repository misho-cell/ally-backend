const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: async <T>(work: (client: { query: jest.Mock }) => Promise<T>): Promise<T> =>
    work({ query: mockClientQuery }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { setSeatCircles } from '../seatCircles.service';

/**
 * #5941 (tester #29, D860): „your closest circle" could not be tested because
 * a fictional seat had no circles — only old Ally ever wrote them. A test seat
 * may now be given them, with every fence of the seat-contact routes.
 */
const SEAT = 186401;
const OUTSIDER = '+12025550142';
const OTHER = '+12025550143';

function seatExists(): void {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: SEAT }] });
}

function nobodyRegistered(): void {
  mockQuery.mockResolvedValueOnce({ rows: [] });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('a test seat holds its contacts in a circle', () => {
  it('writes closest as the old-Ally colour the bubble reads, and clears on null', async () => {
    seatExists();
    nobodyRegistered();
    const result = await setSeatCircles(SEAT, [
      { phone: OUTSIDER, circle: 'closest' },
      { phone: OTHER, circle: null },
    ]);
    expect(result).toEqual({ ok: true, seat: SEAT, set: 1, cleared: 1 });
    const [insertSql, insertParams] = mockClientQuery.mock.calls[0];
    expect(insertSql).toContain('INSERT INTO human_relationship_tiers');
    expect(insertSql).toContain('ON CONFLICT (user_id, contact_phone)');
    expect(insertParams).toEqual([SEAT, [OUTSIDER], ['green'], 'test_seat']);
    const [deleteSql, deleteParams] = mockClientQuery.mock.calls[1];
    expect(deleteSql).toContain('DELETE FROM human_relationship_tiers');
    expect(deleteParams).toEqual([SEAT, [OTHER]]);
  });

  it('refuses a real number before reading or writing anything', async () => {
    const result = await setSeatCircles(SEAT, [{ phone: '+995599123456', circle: 'close' }]);
    expect(result).toMatchObject({ ok: false, refusal: 'not_a_fictional_number', index: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('refuses a circle that is not one of the four, and a colour word', async () => {
    for (const circle of ['green', 'best friend']) {
      const result = await setSeatCircles(SEAT, [{ phone: OUTSIDER, circle }]);
      expect(result).toMatchObject({ ok: false, refusal: 'bad_circle', index: 0 });
    }
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('refuses the same number twice, and an empty batch', async () => {
    expect(
      await setSeatCircles(SEAT, [
        { phone: OUTSIDER, circle: 'close' },
        { phone: OUTSIDER, circle: 'contact' },
      ]),
    ).toMatchObject({ ok: false, refusal: 'duplicate_phone', index: 1 });
    expect(await setSeatCircles(SEAT, [])).toMatchObject({ ok: false, refusal: 'empty' });
  });

  it('refuses an account that is not a test seat', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await setSeatCircles(SEAT, [{ phone: OUTSIDER, circle: 'close' }]);
    expect(result).toEqual({ ok: false, refusal: 'not_a_test_seat' });
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('refuses a number a real account is registered on', async () => {
    seatExists();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await setSeatCircles(SEAT, [{ phone: OUTSIDER, circle: 'close' }]);
    expect(result).toEqual({ ok: false, refusal: 'somebody_is_registered_on_it' });
    expect(mockClientQuery).not.toHaveBeenCalled();
  });
});

describe('the admin route', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );
  const handler = routes.slice(routes.indexOf("'/test-accounts/:id/circles'"));

  it('is a PUT behind the admin router, answering a refusal with 400', () => {
    expect(routes).toContain("adminRouter.put(\n  '/test-accounts/:id/circles'");
    expect(handler).toContain('await setSeatCircles(seatId, circles)');
    expect(handler.indexOf('res.status(400)')).toBeLessThan(handler.indexOf('res.status(200)'));
  });
});
