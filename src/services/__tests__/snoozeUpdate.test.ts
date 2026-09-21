jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { snoozeUpdate, MIN_SNOOZE_DAYS, MAX_SNOOZE_DAYS } from '../pendingUpdates.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const USER = '501';

function updated(rowCount: number) {
  mockQuery.mockResolvedValue({ rows: [], rowCount } as never);
}

beforeEach(() => jest.clearAllMocks());

/**
 * Row 73 — „Later" should postpone an update, not spend it.
 *
 * The row reads as a missing button and it is not. `getPendingUpdates` flips a
 * non-sticky row to 'seen' AT THE MOMENT IT IS SHOWN, because most updates are
 * news and news is reported once. So by the time a person has read the line
 * and tapped „Later", the row is already spent.
 *
 * And nothing could have addressed it: the update's id reached neither the
 * client nor the model. The frontend confirmed the other half on 21 September
 * — their „Later" sends no call at all, because there was none to send.
 */
describe('an update given back instead of spent', () => {
  it('returns a seen row to held, released when they asked', async () => {
    updated(1);

    expect(await snoozeUpdate(USER, 412, 3)).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("status = 'held'");
    expect(sql).toContain('release_at = NOW()');
    expect(params).toEqual([412, USER, 3]);
  });

  /**
   * The user scoping is not decoration. An update id alone is never trusted,
   * the same rule as every phone and contact reference in this codebase.
   */
  it('scopes the write to the owner, so an id alone reaches nothing', async () => {
    updated(1);
    await snoozeUpdate(USER, 412);
    expect(mockQuery.mock.calls[0][0]).toContain('user_id = $2');
  });

  it('says false when the row is not theirs, rather than reporting a postponement', async () => {
    updated(0);
    expect(await snoozeUpdate(USER, 999)).toBe(false);
  });

  it('clamps a silly number instead of losing the update for a year', async () => {
    updated(1);
    await snoozeUpdate(USER, 1, 4000);
    expect(mockQuery.mock.calls[0][1]).toEqual([1, USER, MAX_SNOOZE_DAYS]);

    jest.clearAllMocks();
    updated(1);
    await snoozeUpdate(USER, 1, 0);
    expect(mockQuery.mock.calls[0][1]).toEqual([1, USER, MIN_SNOOZE_DAYS]);
  });

  it('defaults to tomorrow when no time was named', async () => {
    updated(1);
    await snoozeUpdate(USER, 1);
    expect(mockQuery.mock.calls[0][1]).toEqual([1, USER, 1]);
  });
});
