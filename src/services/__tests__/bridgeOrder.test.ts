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
    expect(walk).toContain('(await inBridgeOrder(reached, goalText)).slice(0, MAX_PATHS)');
    const intro = readFileSync(join(__dirname, '..', 'tools', 'requestIntroduction.ts'), 'utf8');
    expect(intro).toContain('void recordIntroPrematch(insertResult.rows[0].id);');
  });
});
