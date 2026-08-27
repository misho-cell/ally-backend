jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueFollowUp: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock('../debrief.service', () => ({
  __esModule: true,
  armSearchDebrief: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { queueFollowUp } from '../pendingUpdates.service';
import { armSearchDebrief } from '../debrief.service';
import { recordSearchOutcome, isSearchOutcome, SEARCH_OUTCOMES } from '../searchOutcome.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueueFollowUp = queueFollowUp as jest.MockedFunction<typeof queueFollowUp>;
const mockArmSearchDebrief = armSearchDebrief as jest.MockedFunction<typeof armSearchDebrief>;

function result(rowCount: number): { rows: unknown[]; rowCount: number } {
  return { rows: [], rowCount };
}

beforeEach(() => jest.clearAllMocks());

describe('isSearchOutcome', () => {
  it('accepts exactly the six ladder rungs and nothing else', () => {
    for (const o of SEARCH_OUTCOMES) expect(isSearchOutcome(o)).toBe(true);
    expect(isSearchOutcome('successful')).toBe(false);
    expect(isSearchOutcome('')).toBe(false);
  });
});

describe('recordSearchOutcome — ticket 6, founder\'s answer ②: "a name found is not success"', () => {
  it("updates the row scoped to the caller's own user_id, never a bare search_id alone", async () => {
    mockQuery.mockResolvedValue(result(1) as never);

    const out = await recordSearchOutcome({
      searchId: 9,
      userId: '501',
      outcome: 'refused',
      reason: 'wrong field, needed a corporate lawyer not a family one',
    });

    expect(out).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('WHERE id = $1 AND user_id = $2');
    expect(params).toEqual([
      9,
      '501',
      'refused',
      'wrong field, needed a corporate lawyer not a family one',
      null,
    ]);
  });

  it("returns false for a search_id that isn't this user's own — never trusted bare, same rule as every other reference", async () => {
    mockQuery.mockResolvedValue(result(0) as never);

    const out = await recordSearchOutcome({ searchId: 9, userId: '999', outcome: 'accepted' });

    expect(out).toBe(false);
    expect(mockQueueFollowUp).not.toHaveBeenCalled();
  });

  it('reaching "sent" schedules the one-week follow-up through T9\'s existing pending_updates path — no new mechanism', async () => {
    mockQuery.mockResolvedValue(result(1) as never);

    await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'sent' });

    expect(mockQueueFollowUp).toHaveBeenCalledWith(
      '501',
      null,
      'search_followup',
      { search_id: 9 },
      7,
    );
  });

  it('does NOT schedule a follow-up for any other rung — only "sent" starts the week-long clock', async () => {
    mockQuery.mockResolvedValue(result(1) as never);

    await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'accepted' });
    await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'replied' });

    expect(mockQueueFollowUp).not.toHaveBeenCalled();
  });

  it('reaching "accepted" arms the 3-day debrief (D49) — and only "accepted" does', async () => {
    mockQuery.mockResolvedValue(result(1) as never);

    await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'accepted' });
    expect(mockArmSearchDebrief).toHaveBeenCalledWith('501', 9);

    mockArmSearchDebrief.mockClear();
    await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'sent' });
    await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'refused' });
    expect(mockArmSearchDebrief).not.toHaveBeenCalled();
  });

  it('a failed debrief arm never fails the outcome write itself', async () => {
    mockQuery.mockResolvedValue(result(1) as never);
    mockArmSearchDebrief.mockRejectedValue(new Error('debrief store down'));

    const out = await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'accepted' });

    expect(out).toBe(true);
  });

  it('carries the "did it work" answer for the followed_up rung', async () => {
    mockQuery.mockResolvedValue(result(1) as never);

    await recordSearchOutcome({ searchId: 9, userId: '501', outcome: 'followed_up', worked: true });

    const params = mockQuery.mock.calls[0][1];
    expect(params).toEqual([9, '501', 'followed_up', null, true]);
  });
});
