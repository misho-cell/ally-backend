jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../db/neo4j/client', () => ({ __esModule: true, getSession: jest.fn() }));
jest.mock('../neo4j.keys', () => ({ __esModule: true, getCompositeKeysForPhones: jest.fn() }));

import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { getCompositeKeysForPhones } from '../neo4j.keys';
import { LinkColours, NO_LINK_COLOURS } from '../colourLinks';
import { AllyColour } from '../oldAllyColours.service';
import { OwnerTieReason } from '../ownerTies';
import { inWorkOrder, isWarmRoute, OrderableRoute, routeWarmth } from '../routeWorkOrder';
import { chainsThroughWarmBridges, hopsFromWarmBridge, middlesFromWalk } from '../warmerRoutes';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSession = getSession as jest.MockedFunction<typeof getSession>;
const mockKeys = getCompositeKeysForPhones as jest.MockedFunction<typeof getCompositeKeysForPhones>;

interface Route extends OrderableRoute {
  readonly id: string;
}

const route = (id: string, hops: number, ownerTie?: OwnerTieReason): Route => ({
  id,
  hops,
  bridges: [ownerTie === undefined ? {} : { owner_tie: ownerTie }],
});

const HOLDS_CLOSE: LinkColours = { ownerColour: null, bridgeHoldsClose: true, weight: 4 };
const OWNER_GREEN: LinkColours = {
  ownerColour: AllyColour.Green,
  bridgeHoldsClose: false,
  weight: 4,
};
const OWNER_RED: LinkColours = { ownerColour: AllyColour.Red, bridgeHoldsClose: false, weight: 1 };

describe('#8845: a route is warm when somebody along its first link is close', () => {
  it('is warm through the owner’s own tie, an old-Ally green, or a bridge holding them close', () => {
    expect(isWarmRoute(route('a', 2, OwnerTieReason.SaidClose), undefined)).toBe(true);
    expect(isWarmRoute(route('b', 2), OWNER_GREEN)).toBe(true);
    expect(isWarmRoute(route('c', 2), HOLDS_CLOSE)).toBe(true);
  });

  it('is not warm through a bare contact, an acquaintance colour, or help given once', () => {
    expect(isWarmRoute(route('d', 2), undefined)).toBe(false);
    expect(isWarmRoute(route('e', 2), OWNER_RED)).toBe(false);
    expect(isWarmRoute(route('f', 2, OwnerTieReason.DealtWith), NO_LINK_COLOURS)).toBe(false);
  });

  it('weighs the owner’s own tie on top of the colours', () => {
    expect(routeWarmth(route('g', 2, OwnerTieReason.Family), OWNER_GREEN)).toBeGreaterThan(
      routeWarmth(route('h', 2), OWNER_GREEN),
    );
  });
});

describe('#8845: the shortest first, then the warmer longer one, then the rest', () => {
  const links = new Map<string, LinkColours>([['beso', HOLDS_CLOSE]]);
  const linkOf = (r: Route): LinkColours | undefined => links.get(r.id);

  it('moves a warm three-hop route up beside the cold two-hop one, past the cut', () => {
    const ranked = [
      route('tornike', 2),
      route('cold2', 2),
      route('cold3', 2),
      route('beso', 3),
      route('far', 4),
    ];
    const out = inWorkOrder(ranked, linkOf, 3);
    expect(out.routes.map((r) => r.id)).toEqual(['tornike', 'beso', 'cold2']);
    expect(out.warmerAt).toBe(1);
  });

  it('leaves the order alone when the shortest route is already the warmest', () => {
    const ranked = [route('beso', 2), route('cold', 3)];
    const out = inWorkOrder(ranked, linkOf, 5);
    expect(out.routes.map((r) => r.id)).toEqual(['beso', 'cold']);
    expect(out.warmerAt).toBeNull();
  });

  it('offers no second route when nothing longer is warm', () => {
    const out = inWorkOrder([route('a', 2), route('b', 3)], linkOf, 5);
    expect(out.warmerAt).toBeNull();
  });

  it('picks the warmest of several longer warm routes', () => {
    const ranked = [route('cold', 2), route('friend', 3, OwnerTieReason.Close), route('beso', 3)];
    const withGreen = (r: Route): LinkColours | undefined =>
      r.id === 'friend' ? OWNER_GREEN : linkOf(r);
    expect(inWorkOrder(ranked, withGreen, 5).routes[1].id).toBe('friend');
  });
});

describe('#8845: the walk from the people the owner is close to', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the walk short and never past the owner’s depth', () => {
    expect(hopsFromWarmBridge(5)).toBe(3);
    expect(hopsFromWarmBridge(2)).toBe(1);
    expect(hopsFromWarmBridge(1)).toBe(0);
  });

  it('turns each walk into a middle that starts with the warm bridge', () => {
    const rows = [
      ['+995500000004', '+995500000005-+995500000006', '+995500000009'],
      ['+995500000004', '+995500000001', '+995500000009'],
    ];
    expect(middlesFromWalk(rows, '+995500000001')).toEqual([['+995500000004', '+995500000005']]);
  });

  it('walks from the owner’s close people to the target', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: '+995500000004' }] } as never);
    mockKeys.mockResolvedValue(new Map([['+995500000004', '+995500000004']]));
    const run = jest.fn().mockResolvedValue({
      records: [{ get: (): string[] => ['+995500000004', '+995500000005', '+995500000009'] }],
    });
    mockSession.mockReturnValue({ run, close: jest.fn() } as never);

    const out = await chainsThroughWarmBridges('7', '+995500000001', '+995500000009', 5);

    expect(out).toEqual([['+995500000004', '+995500000005']]);
    expect(run.mock.calls[0][1]).toEqual({
      userKey: '+995500000001',
      bridgeKeys: ['+995500000004'],
      targetKey: '+995500000009',
    });
  });

  it('does not walk when the owner is close to nobody', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    expect(await chainsThroughWarmBridges('7', 'me', 'them', 5)).toEqual([]);
    expect(mockSession).not.toHaveBeenCalled();
  });

  it('fails towards no extra routes when the graph is down', async () => {
    mockQuery.mockResolvedValue({ rows: [{ phone: '+995500000004' }] } as never);
    mockKeys.mockResolvedValue(new Map());
    const run = jest.fn().mockRejectedValue(new Error('down'));
    mockSession.mockReturnValue({ run, close: jest.fn() } as never);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await chainsThroughWarmBridges('7', 'me', 'them', 5)).toEqual([]);
  });
});
