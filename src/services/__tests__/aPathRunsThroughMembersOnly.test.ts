jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  NETAI_ACTIVE_SUBSCRIPTION_STATUSES: ['active'],
  fetchAccountStates: jest.fn(() => Promise.resolve(new Map())),
  // Phones ending in 9 are not on Netai.
  accountDetailsFor: jest.fn((_s: unknown, phone: string) =>
    phone.endsWith('9') ? { state: 'none' } : { state: 'netai_user' },
  ),
}));

import { query } from '../../db/postgres/client';
import { memberMiddles } from '../memberPaths.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** Task 1849 (§127): every person in the middle is a member, up to four of them (5347). */
describe('the all-member middles of a path', () => {
  beforeEach(() => mockQuery.mockReset());

  it('finds one, two and three in the middle, and drops anyone not on Netai', async () => {
    mockQuery.mockImplementation(((sql: string) => {
      if (sql.includes('ua."contactId" = $1::int'))
        return Promise.resolve({
          rows: [
            { phone: '+1', user_id: 11 },
            { phone: '+2', user_id: 12 },
            { phone: '+9', user_id: 19 },
          ],
        });
      if (sql.includes('WHERE ua.phone = $1'))
        return Promise.resolve({
          rows: [
            { phone: '+1', user_id: 11 },
            { phone: '+3', user_id: 13 },
          ],
        });
      if (sql.includes('JOIN "UserAlias" ub'))
        return Promise.resolve({
          rows: [
            { from_id: 12, mid_id: 14, mid_phone: '+4', last_phone: '+3' },
            { from_id: 12, mid_id: 18, mid_phone: '+8', last_phone: '+3' },
            { from_id: 12, mid_id: 17, mid_phone: '+79', last_phone: '+3' },
          ],
        });
      return Promise.resolve({ rows: [{ from_id: 12, phone: '+3' }] });
    }) as never);

    const middles = await memberMiddles(171, '+995599000000');

    expect(middles).toEqual([['+1'], ['+2', '+3'], ['+2', '+4', '+3'], ['+2', '+8', '+3']]);
  });

  // 5347: the 5th degree — four members in the middle.
  it('finds four in the middle, and drops a chain that comes back through its own people', async () => {
    mockQuery.mockImplementation(((sql: string, params: unknown[]) => {
      if (sql.includes('ua."contactId" = $1::int'))
        return Promise.resolve({ rows: [{ phone: '+2', user_id: 12 }] });
      if (sql.includes('WHERE ua.phone = $1'))
        return Promise.resolve({ rows: [{ phone: '+5', user_id: 15 }] });
      if (sql.includes('holder_id'))
        return Promise.resolve({
          rows: [
            { user_id: 14, phone: '+5', holder_id: 15 },
            { user_id: 16, phone: '+2', holder_id: 12 },
          ],
        });
      if (sql.includes('JOIN "UserAlias" ub') && (params[1] as number[]).includes(14))
        return Promise.resolve({
          rows: [
            { from_id: 12, mid_id: 13, mid_phone: '+3', last_phone: '+4', last_id: 14 },
            { from_id: 12, mid_id: 13, mid_phone: '+3', last_phone: '+6', last_id: 16 },
          ],
        });
      return Promise.resolve({ rows: [] });
    }) as never);

    const middles = await memberMiddles(171, '+995599000000');

    expect(middles).toEqual([['+2', '+3', '+4', '+5']]);
  });

  it('is empty when nobody of the owner’s is a member', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await expect(memberMiddles(171, '+995599000000')).resolves.toEqual([]);
  });
});
