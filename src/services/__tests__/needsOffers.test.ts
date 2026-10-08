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
    expect(isSureMatch(goal, { ...offer, field: 'logistics' })).toBe(false);
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
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    await expect(proposeMatches()).resolves.toBe(1);
    const sql = String(mockQuery.mock.calls[2][0]);
    expect(sql).toContain('WHERE EXISTS (SELECT 1 FROM reach)');
    expect(sql).toContain("m.state = 'declined'");
    expect(sql).toContain('ON CONFLICT (need_goal_id, offer_id) DO NOTHING');
    expect(mockQuery.mock.calls[2][1]).toEqual([1, 10, 20, 5, 90]);
  });

  it('runs once a night, in its hour', () => {
    expect(isMatchHour(new Date('2026-10-09T02:10:00Z'), null)).toBe(true);
    expect(isMatchHour(new Date('2026-10-09T02:40:00Z'), '2026-10-09')).toBe(false);
    expect(isMatchHour(new Date('2026-10-09T03:10:00Z'), null)).toBe(false);
  });
});
