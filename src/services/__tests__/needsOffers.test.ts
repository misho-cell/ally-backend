jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query as _query } from '../../db/postgres/client';
import { isSureMatch, proposeMatches, surePairs } from '../needsOffers.service';
import { isMatchHour } from '../needsOffers.cron';

/** 1699 (A16) part 1: the nightly matcher only proposes, and only sure matches. */
const mockQuery = _query as jest.Mock;
const goal = { id: 1, user_id: 10, title: 'find an investor for a hotel in Kobuleti' };
const offer = {
  id: 5,
  user_id: 20,
  text: 'Open to hospitality and hotel projects',
  field: 'hotel',
};

beforeEach(() => jest.clearAllMocks());

describe('the needs-to-offers matcher (1699)', () => {
  it('a goal that names the offer’s field is a sure match', () => {
    expect(isSureMatch(goal, offer)).toBe(true);
  });

  it('a vague one, one without a field, and one’s own offer are dropped', () => {
    expect(isSureMatch(goal, { ...offer, field: 'logistics', text: 'Open to freight work' })).toBe(
      false,
    );
    expect(isSureMatch(goal, { ...offer, field: null })).toBe(false);
    expect(isSureMatch(goal, { ...offer, user_id: 10 })).toBe(false);
  });

  it('a night proposes at most its limit', () => {
    const goals = Array.from({ length: 5 }, (_, i) => ({ ...goal, id: i + 1 }));
    expect(surePairs(goals, [offer], 3)).toHaveLength(3);
  });

  it('no offers, no reading of goals at all', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(proposeMatches()).resolves.toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('a pair is written only when reachable, never twice, never within 90 days of a decline', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [offer] });
    mockQuery.mockResolvedValueOnce({ rows: [goal] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    await expect(proposeMatches()).resolves.toBe(1);
    const sql = String(mockQuery.mock.calls[4][0]);
    expect(sql).toContain('WHERE ($6::boolean OR EXISTS (SELECT 1 FROM reach))');
    expect(sql).toContain("m.state = 'declined'");
    expect(sql).toContain('ON CONFLICT (need_goal_id, offer_id) DO NOTHING');
    expect(mockQuery.mock.calls[4][1]).toEqual([1, 10, 20, 5, 90, false]);
  });

  it('two members of the same community reach each other without holding each other (#7823)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [offer] });
    mockQuery.mockResolvedValueOnce({ rows: [goal] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { user_id: 10, phone: '+995500000010', group: 'Axel', name: 'A', all_aliases: [] },
        { user_id: 20, phone: '+995500000020', group: 'Axel', name: 'B', all_aliases: [] },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    await expect(proposeMatches()).resolves.toBe(1);
    expect(String(mockQuery.mock.calls[2][0])).toContain("f.field_type = 'member_of'");
    expect(mockQuery.mock.calls[4][1]).toEqual([1, 10, 20, 5, 90, true]);
  });

  /** #7823 (tester 76180): unreachable pairs no longer use up the run before older goals are checked. */
  it('checks the older goals too when many newer pairs cannot reach each other', async () => {
    const offers = Array.from({ length: 10 }, (_, i) => ({
      ...offer,
      id: 100 + i,
      user_id: 200 + i,
    }));
    const goals = Array.from({ length: 30 }, (_, i) => ({ ...goal, id: 1000 - i }));
    mockQuery.mockResolvedValueOnce({ rows: offers });
    mockQuery.mockResolvedValueOnce({ rows: goals });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Only the oldest goal reaches anybody: its 300th candidate pair.
    mockQuery.mockImplementation((_sql: string, params: unknown[]) =>
      Promise.resolve({ rows: params[0] === 971 && params[3] === 100 ? [{ id: 7 }] : [] }),
    );
    await expect(proposeMatches()).resolves.toBe(1);
  });

  it('skips the pairs already proposed without asking the database again', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [offer] });
    mockQuery.mockResolvedValueOnce({ rows: [goal] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ need_goal_id: 1, offer_id: 5 }] });
    await expect(proposeMatches()).resolves.toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(String(mockQuery.mock.calls[3][0])).toContain(
      'FROM matches WHERE need_goal_id = ANY($1::int[])',
    );
  });

  it('runs once an hour (#7823: a need and an offer meet the same hour)', () => {
    expect(isMatchHour(new Date('2026-10-09T02:10:00Z'), null)).toBe(true);
    expect(isMatchHour(new Date('2026-10-09T02:40:00Z'), '2026-10-09T02')).toBe(false);
    expect(isMatchHour(new Date('2026-10-09T03:10:00Z'), '2026-10-09T02')).toBe(true);
  });
});
