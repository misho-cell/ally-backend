jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/findWarmPath', () => ({ __esModule: true, namesFor: jest.fn() }));
jest.mock('../ownerTies', () => ({
  __esModule: true,
  ...jest.requireActual('../ownerTies'),
  ownerTiesTo: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { namesFor } from '../tools/findWarmPath';
import { OwnerTieReason, ownerTiesTo } from '../ownerTies';
import { warmChainsHolding } from '../farCircles.service';
import { normalizePhone, phoneDigits } from '../phone';
import { noWarmBridge } from '../chat.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockNames = namesFor as jest.MockedFunction<typeof namesFor>;
const mockTies = ownerTiesTo as jest.MockedFunction<typeof ownerTiesTo>;

const OWNER = 190001;
const COLD = 190002;
const BEST_FRIEND = 190003;
const M = 190004;
const phoneOf = (id: number): string => `99559911${id}`;
/** Who each member saved: owner → cold and best friend; best friend → M; M and cold → the solver. */
const SAVES: Readonly<Record<number, readonly number[]>> = {
  [OWNER]: [COLD, BEST_FRIEND],
  [BEST_FRIEND]: [M],
};
const SOLVER_HOLDERS = [COLD, M];

function world(): void {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const ring = (params?.[0] ?? []) as number[];
    const seen = (params?.[1] ?? []) as number[];
    if (sql.includes('DISTINCT ON (up."userId")')) {
      const rows = ring.flatMap((from) =>
        (SAVES[from] ?? [])
          .filter((to) => !seen.includes(to))
          .map((to) => ({ from_id: from, user_id: to, phone: phoneOf(to) })),
      );
      return { rows } as never;
    }
    if (sql.includes('WITH ORDINALITY')) return { rows: [] } as never;
    if (sql.includes('LIKE ALL')) {
      const rows = ring
        .filter((id) => SOLVER_HOLDERS.includes(id))
        .map((id) => ({
          holder_id: id,
          phone: '995599888000',
          alias: 'Enterprise Georgia grants head',
        }));
      return { rows } as never;
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

/**
 * #1849 (the tester's world W, 0 of 3): owner → cold contact → solver is two
 * hops; owner → best friend → M → solver is three. Only the cold one was found.
 */
describe('#1849: a warm longer route is offered beside a cold short one', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    world();
    mockNames.mockImplementation(
      async (_owner: string, phones: string[]) =>
        new Map(phones.map((p) => [normalizePhone(p), `member ${p.slice(-6)}`])) as never,
    );
    mockTies.mockResolvedValue(
      new Map([
        [phoneDigits(phoneOf(BEST_FRIEND)), { closeness: 0.9, reason: OwnerTieReason.SaidClose }],
      ]),
    );
  });

  it('starts every chain with someone the owner is close to', async () => {
    const found = await warmChainsHolding(OWNER, 'Enterprise Georgia grants');
    expect(found).toHaveLength(1);
    expect(found[0].firstLinkPhone).toBe(normalizePhone(phoneOf(BEST_FRIEND)));
    expect(found[0].hops).toBe(3);
  });

  it('finds nothing when the owner is close to nobody', async () => {
    mockTies.mockResolvedValue(new Map());
    expect(await warmChainsHolding(OWNER, 'Enterprise Georgia grants')).toEqual([]);
  });

  it('looks only when no go-between in the second circle is close to the owner', () => {
    const cold = { results: [{ via_contacts: [{ name: 'Cold', phone: '1' }] }] };
    const warm = {
      results: [{ via_contacts: [{ name: 'Friend', phone: '2', owner_tie: 'you_said_close' }] }],
    };
    const helped = {
      results: [{ via_contacts: [{ name: 'Helper', phone: '3', owner_tie: 'helped_you_before' }] }],
    };
    expect(noWarmBridge(cold)).toBe(true);
    expect(noWarmBridge(warm)).toBe(false);
    expect(noWarmBridge(helped)).toBe(true);
    expect(noWarmBridge({ found: false })).toBe(false);
  });
});
