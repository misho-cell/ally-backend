import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../../neo4j.keys', () => ({
  __esModule: true,
  getCompositeKeyForUser: jest.fn(),
  getCompositeKeyForPhone: jest.fn(),
}));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

/** Only +995500000042 is on Netai. Everyone else is an old Ally account. */
const THE_ONLY_NETAI_BRIDGE = '+995500000042';

jest.mock('../membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn().mockResolvedValue(new Map()),
  isMemberPhone: jest.fn((_m: unknown, phone: string) => phone === '+995500000042'),
  accountStateFor: jest.fn((_m: unknown, phone: string) =>
    phone === '+995500000042' ? 'netai_user' : 'ally_account',
  ),
}));

import { query } from '../../../db/postgres/client';
import { getSession } from '../../../db/neo4j/client';
import { getCompositeKeyForPhone, getCompositeKeyForUser } from '../../neo4j.keys';
import { getExcludedPhones } from '../../block.service';
import { findWarmPath, WarmPath } from '../findWarmPath';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUserKey = getCompositeKeyForUser as jest.MockedFunction<typeof getCompositeKeyForUser>;
const mockPhoneKey = getCompositeKeyForPhone as jest.MockedFunction<typeof getCompositeKeyForPhone>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;

const ME = '+995500000001';
const TARGET = '+995500000009';

/**
 * ⚠️ THIS MOCK OBEYS THE `LIMIT` IN THE CYPHER IT IS HANDED, and that is the
 * whole point of it rather than an ornament.
 *
 * The first version returned every path it was given no matter what the query
 * said. Two tests below then passed against the UNFIXED code — the sort would
 * still lift the relayable route to the top, because the mock had handed it
 * one the real database never would have. The bug lived in the LIMIT, and a
 * mock that ignores the LIMIT cannot see it.
 *
 * That is the same shape as the assertions that have cost me most today: the
 * measurement was right and the question was different.
 */
function graphReturning(paths: string[][]): { run: jest.Mock; close: jest.Mock } {
  const session = {
    run: jest.fn().mockImplementation((cypher: string) => {
      const limit = Number(/LIMIT (\d+)/.exec(cypher)?.[1] ?? paths.length);
      return Promise.resolve({
        records: paths.slice(0, limit).map((keys) => ({ get: (): string[] => keys })),
      });
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  mockSession.mockReturnValue(session as never);
  return session;
}

/** n two-hop routes through n different old-Ally bridges. */
function decoyRoutes(n: number): string[][] {
  return Array.from({ length: n }, (_, i) => [
    ME,
    `+9955000001${String(i).padStart(2, '0')}`,
    TARGET,
  ]);
}

const netaiRoute = [ME, THE_ONLY_NETAI_BRIDGE, TARGET];

beforeEach(() => {
  jest.clearAllMocks();
  mockUserKey.mockResolvedValue(ME);
  mockPhoneKey.mockResolvedValue(TARGET);
  mockExcluded.mockResolvedValue([]);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

/**
 * ⚠️ ITEM D — THE WARM PATH SKIPPED THE ONLY BRIDGE THAT COULD CARRY IT.
 *
 * The tester, 25 September, on account 501: `search_second_degree` for an
 * electrician listed four bridges, ONE of them a Netai user.
 * `find_warm_path` to that same person returned five routes, every one
 * through an old-Ally account, every one `relayable: false`.
 *
 * The usable bridge was not ranked below the others. It was never ranked.
 *
 * `LIMIT 5` was in the Cypher. Neo4j applies it to a stream of equally short
 * paths in whatever order it produces them, and the sort that lifts a
 * relayable route to the top ran in TypeScript afterwards — so it could only
 * reorder five survivors picked before anything knew who was on Netai.
 * Membership lives in Postgres; the graph cannot see it and never could.
 *
 * This is the day's recurring fault in a third place: something took a slice
 * and then drew a conclusion over it, with nothing in the output admitting a
 * slice had been taken.
 */
describe('the cut is made after the ranking, not before it', () => {
  it('finds the one relayable route even when decoys fill the whole page', async () => {
    // Nine old-Ally routes ahead of it — the graph offers the good one last.
    graphReturning([...decoyRoutes(9), netaiRoute]);

    const out = await findWarmPath('1', TARGET);

    expect(out.found).toBe(true);
    const { paths } = out as { paths: WarmPath[] };
    expect(paths[0].relayable).toBe(true);
    expect(paths[0].bridges[0].phone).toBe(THE_ONLY_NETAI_BRIDGE);
  });

  /** The user is still shown five. Widening the search must not widen the answer. */
  it('still returns no more than five routes', async () => {
    graphReturning([...decoyRoutes(9), netaiRoute]);

    const out = await findWarmPath('1', TARGET);

    expect((out as { paths: WarmPath[] }).paths).toHaveLength(5);
  });

  it('asks the graph for more routes than it shows', async () => {
    const session = graphReturning([netaiRoute]);

    await findWarmPath('1', TARGET);

    const cypher = session.run.mock.calls[0][0] as string;
    expect(cypher).toContain('LIMIT 25');
    expect(cypher).not.toContain('LIMIT 5');
  });

  /**
   * A shorter route still wins. A one-hop bridge who is not on Netai is the
   * user's OWN contact, whom they can simply write to — that is better than a
   * two-hop relay, and preferring relayable over short would have been a
   * second bug dressed as a fix.
   */
  it('does not let relayable overtake a shorter route', async () => {
    graphReturning([
      [ME, THE_ONLY_NETAI_BRIDGE, '+995500000150', TARGET], // 3 hops, relayable
      [ME, '+995500000151', TARGET], // 2 hops, not relayable
    ]);

    const out = await findWarmPath('1', TARGET);
    const { paths } = out as { paths: WarmPath[] };

    expect(paths[0].hops).toBe(2);
    expect(paths[0].relayable).toBe(false);
  });

  /**
   * The same cut sat in front of the blocked-contact filter: five routes could
   * all run through blocked people while an unblocked one waited just past the
   * limit, and the tool would answer „no warm path leads to this person".
   * „I could not look past five" is not „there is nobody".
   */
  it('finds a route past a page filled with blocked bridges', async () => {
    const blocked = decoyRoutes(9);
    mockExcluded.mockResolvedValue(blocked.map((p) => p[1]));
    graphReturning([...blocked, netaiRoute]);

    const out = await findWarmPath('1', TARGET);

    expect(out.found).toBe(true);
    expect((out as { paths: WarmPath[] }).paths).toHaveLength(1);
  });
});

/**
 * And the half that is not a ranking problem: when the graph really does hold
 * more routes than were looked at, the answer says so. „These are the best
 * five" and „these are five of many" are different facts, and only the tool
 * knows which one it is handing over.
 */
describe('it says when it ranked a slice', () => {
  it('claims to have ranked everything when it did', async () => {
    graphReturning([...decoyRoutes(3), netaiRoute]);

    const out = await findWarmPath('1', TARGET);

    expect((out as { ranked_every_route: boolean }).ranked_every_route).toBe(true);
    expect((out as { note: string }).note).not.toContain('MORE than');
  });

  it('admits it when the graph filled the whole candidate set', async () => {
    graphReturning(decoyRoutes(25));

    const out = await findWarmPath('1', TARGET);

    expect((out as { ranked_every_route: boolean }).ranked_every_route).toBe(false);
    expect((out as { note: string }).note).toContain('MORE than the 5 routes shown');
  });

  /** The consent rules are served either way — the caveat is added, never swapped in. */
  it('keeps the consent note when it adds the caveat', async () => {
    graphReturning(decoyRoutes(25));

    const out = await findWarmPath('1', TARGET);

    expect((out as { note: string }).note).toContain('request_introduction');
    expect((out as { note: string }).note).toContain('never a number');
  });
});

/**
 * ⚠️ THE SECOND HALF OF ITEM D, and a different bug with the same symptom:
 * „Same bridge also listed twice in the second-degree result under two
 * spellings (one contact ref)."
 *
 * An owner who saved one person twice — „Dato" and „Dato Kapanadze", one
 * phone — matched two `UserAlias` rows, and the DISTINCTs then worked exactly
 * as written: two names are two values, and two jsonb objects differing only
 * in their name are two objects. One bridge was offered as two people to ask.
 *
 * The aggregate could never have fixed it; by then the duplicate is two rows.
 */
describe('one bridge is named once', () => {
  const sql = readFileSync(join(__dirname, '..', 'searchSecondDegree.ts'), 'utf8');

  it('picks a single alias per bridge before anything aggregates it', () => {
    expect(sql).toContain('LEFT JOIN LATERAL (');
    expect(sql).toContain('ua.phone = fu.via_phone');
    expect(sql).toContain(') ua_via ON TRUE');
  });

  it('no longer joins every spelling the owner saved', () => {
    expect(sql).not.toContain('LEFT JOIN "UserAlias" ua_via ON ua_via.phone = fu.via_phone');
  });

  /**
   * Deterministic, because a search run twice that names the bridge two
   * different ways is its own bug. Longest spelling wins — the fullest form of
   * the name is the one worth showing — and the alias itself breaks a tie.
   */
  it('chooses the same spelling every time', () => {
    const lateral = sql.slice(sql.indexOf('LEFT JOIN LATERAL ('), sql.indexOf(') ua_via ON TRUE'));

    expect(lateral).toContain('ORDER BY LENGTH(TRIM(ua.alias)) DESC, ua.alias');
    expect(lateral).toContain('LIMIT 1');
  });

  /** Blank aliases are not a spelling, and one would beat a real name to the top. */
  it('does not let an empty alias win', () => {
    const lateral = sql.slice(sql.indexOf('LEFT JOIN LATERAL ('), sql.indexOf(') ua_via ON TRUE'));

    expect(lateral).toContain("NULLIF(TRIM(ua.alias), '') IS NOT NULL");
  });

  /**
   * ⚠️ THE FIRST VERSION OF THAT COMMENT ENDED THE STRING IT WAS INSIDE — the
   * third time today. It put a column name in backticks, and this SQL lives in
   * a JS template literal.
   */
  it('keeps backticks out of the lateral', () => {
    const lateral = sql.slice(
      sql.indexOf('-- ⚠️ ONE SPELLING PER BRIDGE'),
      sql.indexOf(') ua_via ON TRUE'),
    );

    expect(lateral).not.toContain('`');
  });
});
