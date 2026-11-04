jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../../neo4j.keys', () => ({
  __esModule: true,
  getCompositeKeyForUser: jest.fn(),
  getCompositeKeyForPhone: jest.fn(),
  getCompositeKeysForPhones: jest.fn(),
}));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../excludedHolders.service', () => ({
  excludedHolderPhones: jest.fn().mockResolvedValue(new Set<string>()),
}));
jest.mock('../../memberPaths.service', () => ({
  __esModule: true,
  memberMiddles: jest.fn().mockResolvedValue([]),
}));
jest.mock('../membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn().mockResolvedValue(new Map()),
  isMemberPhone: jest.fn(() => false),
  accountStateFor: jest.fn(() => 'ally_account'),
}));

import { query } from '../../../db/postgres/client';
import { getSession } from '../../../db/neo4j/client';
import {
  getCompositeKeyForPhone,
  getCompositeKeyForUser,
  getCompositeKeysForPhones,
} from '../../neo4j.keys';
import { findWarmPath, WarmPath } from '../findWarmPath';
import { RouteRole } from '../../routeWorkOrder';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUserKey = getCompositeKeyForUser as jest.MockedFunction<typeof getCompositeKeyForUser>;
const mockPhoneKey = getCompositeKeyForPhone as jest.MockedFunction<typeof getCompositeKeyForPhone>;
const mockKeys = getCompositeKeysForPhones as jest.MockedFunction<typeof getCompositeKeysForPhones>;

const ME = '+995500000001';
const COLD_BRIDGE = '+995500000002';
const WARM_BRIDGE = '+995500000004';
const WARM_NEXT = '+995500000005';
const TARGET = '+995500000009';

/** The graph's shortest walk finds the cold route; the walk from close people finds the warm one. */
function graph(warmWalk: string[][]): jest.Mock {
  const run = jest.fn().mockImplementation((cypher: string) => {
    const paths = cypher.includes('UNWIND') ? warmWalk : [[ME, COLD_BRIDGE, TARGET]];
    return Promise.resolve({ records: paths.map((keys) => ({ get: (): string[] => keys })) });
  });
  mockSession.mockReturnValue({ run, close: jest.fn() } as never);
  return run;
}

/** The owner holds the warm bridge green in old Ally; nothing else is coloured. */
function postgres(): void {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('close_people')) return { rows: [{ phone: WARM_BRIDGE }] } as never;
    if (sql.includes('human_relationship_tiers own')) {
      const row = {
        bridge_phone: WARM_BRIDGE,
        next_phone: WARM_NEXT,
        owner_tier: 'green',
        bridge_tier: null,
        bridge_labels: null,
      };
      return { rows: [row] } as never;
    }
    return { rows: [] } as never;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserKey.mockResolvedValue(ME);
  mockPhoneKey.mockResolvedValue(TARGET);
  mockKeys.mockResolvedValue(new Map([[WARM_BRIDGE, WARM_BRIDGE]]));
  postgres();
});

/**
 * #8845 (the founder, 4 Nov): Erekle's case — two hops through a contact he
 * holds no tie to, three hops through somebody close. The shorter cold route
 * always won and the warm one was never handed over.
 */
describe('#8845: a cold short route and a warm longer one are both handed over', () => {
  it('returns the shortest first and the warmer longer one second, each marked', async () => {
    graph([[WARM_BRIDGE, WARM_NEXT, TARGET]]);

    const out = await findWarmPath('1', TARGET);

    expect(out.found).toBe(true);
    if (!out.found) return;
    const [first, second] = out.paths as WarmPath[];
    expect(first.bridges[0].phone).toBe(COLD_BRIDGE);
    expect(first).toMatchObject({ hops: 2, warm: false, route: RouteRole.Shortest });
    expect(second.bridges.map((b) => b.phone)).toEqual([WARM_BRIDGE, WARM_NEXT]);
    expect(second).toMatchObject({ hops: 3, warm: true, route: RouteRole.WarmerLonger });
    expect(second.bridges[0].colour_why).toContain('one of your closest people');
    expect(out.warmer_longer_route).toBe(true);
    expect(out.note).toContain('the shortest first, then the warmer one');
  });

  it('marks nothing and adds no note when no warmer longer route exists', async () => {
    graph([]);

    const out = await findWarmPath('1', TARGET);

    if (!out.found) throw new Error('expected a route');
    expect(out.paths).toHaveLength(1);
    expect(out.paths[0].route).toBeUndefined();
    expect(out.warmer_longer_route).toBe(false);
    expect(out.note).not.toContain('warmer_longer');
  });
});
