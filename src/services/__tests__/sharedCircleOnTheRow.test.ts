jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  sharedCircleKey,
  sharedCirclesForCampaigns,
  withSharedCircles,
} from '../chorusCampaign.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Ticket 20 row 40's fourth column — how many people the inviter and the
 * target both know.
 *
 * The frontend asked for the field rather than guess it, and the field did not
 * exist: the count was built on 21 September into the outgoing MESSAGE only.
 * Putting it on the admin row needed a different shape, not the same function
 * in a loop — the per-pair query is 0.79 s against an 8.4M-row table and the
 * open campaigns carry 77 pairs.
 *
 * Measured live the same night, worst case (500 campaigns): 2.3 s cold,
 * 0.5-0.6 s warm over three runs, started beside the page query.
 */
beforeEach(() => jest.clearAllMocks());

describe('sharedCirclesForCampaigns', () => {
  it('keys each count by the pair it belongs to', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { inviter: 160584, target: '+995555000001', shared: '46' },
        { inviter: 501, target: '+995555000001', shared: '3' },
      ],
    } as never);

    const out = await sharedCirclesForCampaigns(100);

    expect(out.get(sharedCircleKey(160584, '+995555000001'))).toBe(46);
    expect(out.get(sharedCircleKey(501, '+995555000001'))).toBe(3);
  });

  it('counts come back as numbers, not the strings Postgres sends', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ inviter: 1, target: '+1', shared: '12' }],
    } as never);

    const out = await sharedCirclesForCampaigns(100);

    expect(out.get(sharedCircleKey(1, '+1'))).toBe(12);
    expect(typeof out.get(sharedCircleKey(1, '+1'))).toBe('number');
  });

  /**
   * An admin page must not fail to render because a count could not be taken,
   * and an empty map must read as "not known" rather than as zero — the caller
   * leaves the field off entirely in that case.
   */
  it('answers with an empty map when the query fails, and does not throw', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('statement timeout'));

    await expect(sharedCirclesForCampaigns(100)).resolves.toEqual(new Map());

    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('passes the page size through, so the counts cover the rows shown', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await sharedCirclesForCampaigns(37);

    expect(mockQuery.mock.calls[0][1]).toEqual([37]);
  });

  /** One query for the whole page is the point; a loop was the thing rejected. */
  it('asks the database once, whatever the page holds', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await sharedCirclesForCampaigns(500);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('withSharedCircles', () => {
  const rows = [
    {
      id: 1,
      target_phone: '+995555000001',
      inviters: [
        { name: 'Lika', inviter_user_id: 160584, state: 'asked' },
        { name: 'Tornike', inviter_user_id: 501, state: 'pending' },
      ],
    },
  ];

  it('puts each count on the inviter it belongs to, not on the campaign', () => {
    const shared = new Map([
      [sharedCircleKey(160584, '+995555000001'), 46],
      [sharedCircleKey(501, '+995555000001'), 3],
    ]);

    const out = withSharedCircles(rows, shared);
    const inviters = out[0]['inviters'] as Record<string, unknown>[];

    expect(inviters[0]['shared_circle']).toBe(46);
    expect(inviters[1]['shared_circle']).toBe(3);
  });

  /**
   * The distinction this week has been about: „you two share nobody" is a real
   * answer and „the count did not run" is not an answer at all. A pair with no
   * row gets NO FIELD, so nothing can render it as a zero.
   */
  it('leaves the field off a pair it has no count for, rather than writing 0', () => {
    const shared = new Map([[sharedCircleKey(160584, '+995555000001'), 46]]);

    const out = withSharedCircles(rows, shared);
    const inviters = out[0]['inviters'] as Record<string, unknown>[];

    expect(inviters[0]['shared_circle']).toBe(46);
    expect('shared_circle' in inviters[1]).toBe(false);
  });

  it('keeps a real zero, which is a different fact from an absent one', () => {
    const shared = new Map([[sharedCircleKey(501, '+995555000001'), 0]]);

    const out = withSharedCircles(rows, shared);
    const inviters = out[0]['inviters'] as Record<string, unknown>[];

    expect(inviters[1]['shared_circle']).toBe(0);
  });

  it('changes nothing at all when no count could be taken', () => {
    expect(withSharedCircles(rows, new Map())).toEqual(rows);
  });
});
