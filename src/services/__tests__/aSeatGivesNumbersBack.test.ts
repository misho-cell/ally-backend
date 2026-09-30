const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 7 });
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: (fn: (c: { query: jest.Mock }) => Promise<unknown>) =>
    fn({ query: clientQuery }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { allFictionalNumbers } from '../fictionalNumbers';
import { MAX_BULK_CONTACTS, removeSeatContactsBulk } from '../seatContactsBulk.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const SEAT = 172959;

function seat(isSeat: boolean): void {
  mockQuery.mockResolvedValue({ rows: isSeat ? [{ user_id: SEAT }] : [], rowCount: 1 } as never);
}

beforeEach(() => jest.clearAllMocks());

/**
 * §72: Test 73's 1,031 contacts used up every free fictional number, so no new
 * seat could be made. This gives numbers back — and nothing else.
 */
describe('a seat gives numbers back', () => {
  it('removes the numbers from the seat’s phonebook, tags and aliases, in one transaction', async () => {
    seat(true);
    const phones = allFictionalNumbers().slice(0, 7);
    const result = await removeSeatContactsBulk(SEAT, phones);
    expect(result).toEqual({ ok: true, seat: SEAT, removed: 7 });
    expect(String(clientQuery.mock.calls[0][0])).toContain(
      'DELETE FROM "UserTags" WHERE "contactId" = $1',
    );
    expect(String(clientQuery.mock.calls[1][0])).toContain(
      'DELETE FROM "UserAlias" WHERE "contactId" = $1',
    );
    expect(clientQuery.mock.calls[1][1]).toEqual([SEAT, phones]);
  });

  it('refuses a real-looking number, and touches nothing', async () => {
    seat(true);
    const result = await removeSeatContactsBulk(SEAT, [allFictionalNumbers()[0], '+995599000000']);
    expect(result).toMatchObject({ ok: false, refusal: 'not_a_fictional_number', index: 1 });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('refuses an account that is not a test seat', async () => {
    seat(false);
    const result = await removeSeatContactsBulk(501, allFictionalNumbers().slice(0, 1));
    expect(result).toEqual({ ok: false, refusal: 'not_a_test_seat' });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('refuses an empty or oversized batch', async () => {
    expect(await removeSeatContactsBulk(SEAT, [])).toEqual({ ok: false, refusal: 'empty' });
    const tooMany = Array.from({ length: MAX_BULK_CONTACTS + 1 }, () => allFictionalNumbers()[0]);
    expect(await removeSeatContactsBulk(SEAT, tooMany)).toEqual({ ok: false, refusal: 'too_many' });
  });
});

describe('the route', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('is an admin route that answers 400 on a refusal and 200 on success', () => {
    const route = routes.slice(routes.indexOf("'/test-accounts/:id/contacts/bulk-remove'"));
    expect(route.slice(0, 1400)).toContain('removeSeatContactsBulk(seatId, phones)');
    expect(route.slice(0, 1400)).toContain('res.status(400)');
    expect(route.slice(0, 1400)).toContain('res.status(200)');
  });
});
