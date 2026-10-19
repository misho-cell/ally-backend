jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../prematch.service', () => {
  const actual = jest.requireActual('../prematch.service');
  return { ...actual, prematchMany: jest.fn() };
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import { PrematchSource, PrematchWord, prematchMany } from '../prematch.service';
import { orderPaths, recordIntroPrematch } from '../bridgeOrder';

/**
 * 1697 (A14): the bridge most likely to take the request comes first, the rare
 * shared contact before the famous one; both sides of a request are scored at once.
 */
const mockQuery = _query as jest.Mock;
const word = (w: PrematchWord) => ({ word: w, source: PrematchSource.OwnProfile });
const path = (phone: string, hops = 2, relayable = true) => ({
  hops,
  relayable,
  bridges: [{ phone }],
});

beforeEach(() => jest.clearAllMocks());

describe('the bridges in A14’s order (1697)', () => {
  it('a bridge whose own data fits the goal comes before one who is not of the field', () => {
    const b1 = path('+995555000001');
    const b2 = path('+995555000002');
    const ordered = orderPaths([b2, b1], {
      words: new Map([
        ['995555000001', word(PrematchWord.LikelyYes)],
        ['995555000002', word(PrematchWord.NotHisField)],
      ]),
      rates: new Map(),
      holders: new Map(),
    });
    expect(ordered).toEqual([b1, b2]);
  });

  it('with the same fit, the one who answers in the field first, then the rarer shared contact', () => {
    const famous = path('+995555000003');
    const rare = path('+995555000004');
    const answers = path('+995555000005');
    const ordered = orderPaths([famous, rare, answers], {
      words: new Map(),
      rates: new Map([['995555000005', { field: 0.8, overall: 0.8 }]]),
      holders: new Map([
        ['995555000003', 400],
        ['995555000004', 3],
        ['995555000005', 50],
      ]),
    });
    expect(ordered).toEqual([answers, rare, famous]);
  });

  it('fewer hops still come first, whatever the fit', () => {
    const near = path('+995555000006', 2);
    const far = path('+995555000007', 3);
    const ordered = orderPaths([far, near], {
      words: new Map([['995555000007', word(PrematchWord.LikelyYes)]]),
      rates: new Map(),
      holders: new Map(),
    });
    expect(ordered).toEqual([near, far]);
  });

  it('both sides of a request are written at the same moment, from the goal', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { bridge_phone: '+995555000001', receiver_phone: '+995555000009', goal_text: 'logistics' },
      ],
    });
    (prematchMany as jest.Mock).mockResolvedValue(
      new Map([
        ['995555000001', word(PrematchWord.LikelyYes)],
        ['995555000009', word(PrematchWord.Possibly)],
      ]),
    );
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await recordIntroPrematch(12);
    expect(mockQuery.mock.calls[1][1]).toEqual([12, 'likely_yes', 'possibly']);
  });

  it('the warm path and the request are wired to it', () => {
    const walk = readFileSync(join(__dirname, '..', 'tools', 'findWarmPath.ts'), 'utf8');
    // #5974: the colour order sits on top of it, and the cut is still made after both.
    expect(walk).toContain('inBridgeOrder(reached, goalText, userId)');
    expect(walk).toContain('inColourOrder(bridgeOrdered, targetPhone, links).slice(0, MAX_PATHS)');
    const intro = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(intro).toContain('void recordIntroPrematch(insertResult.rows[0].id);');
  });
});

describe('the owner’s closeness to the bridge (founder, 17 Oct, box 65045)', () => {
  it('a close friend comes before a near-stranger, whatever the fit, after hops', () => {
    const stranger = path('+995555000010');
    const friend = path('+995555000011');
    const ordered = orderPaths([stranger, friend], {
      words: new Map([['995555000010', word(PrematchWord.LikelyYes)]]),
      rates: new Map(),
      holders: new Map(),
      closeness: new Map([
        ['995555000010', 0.4],
        ['995555000011', 0.67],
      ]),
    });
    expect(ordered).toEqual([friend, stranger]);
    const nearer = path('+995555000010', 2);
    const fartherFriend = path('+995555000011', 3);
    expect(
      orderPaths([fartherFriend, nearer], {
        words: new Map(),
        rates: new Map(),
        holders: new Map(),
        closeness: new Map([['995555000011', 0.9]]),
      }),
    ).toEqual([nearer, fartherFriend]);
  });

  it('two near-strangers a few hundredths apart are still ordered by the fit', () => {
    const a = path('+995555000012');
    const b = path('+995555000013');
    const ordered = orderPaths([a, b], {
      words: new Map([['995555000013', word(PrematchWord.LikelyYes)]]),
      rates: new Map(),
      holders: new Map(),
      closeness: new Map([
        ['995555000012', 0.42],
        ['995555000013', 0.4],
      ]),
    });
    expect(ordered).toEqual([b, a]);
  });

  it('adds what the owner said or did with the bridge to the stored tie', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { closenessTo } = require('../bridgeOrder') as typeof import('../bridgeOrder');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ phone: '+995555000014', strength: 0.4 }] })
      .mockResolvedValueOnce({
        rows: [
          { contact_phone: '+995555000014', total: '0.5', events: '1', kinds: ['stated_close'] },
        ],
      });
    const closeness = await closenessTo('501', ['+995555000014']);
    expect(closeness.get('995555000014')).toBeCloseTo(0.9);
  });
});
