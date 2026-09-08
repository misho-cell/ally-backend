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
jest.mock('../membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn().mockResolvedValue(new Map()),
  isMemberPhone: jest.fn((_m: unknown, phone: string) => phone !== '+995500000003'),
  accountStateFor: jest.fn((_m: unknown, phone: string) =>
    phone === '+995500000003' ? 'ally_account' : 'netai_user',
  ),
}));

import { query } from '../../../db/postgres/client';
import { getSession } from '../../../db/neo4j/client';
import { getCompositeKeyForPhone, getCompositeKeyForUser } from '../../neo4j.keys';
import { getExcludedPhones } from '../../block.service';
import { findWarmPath } from '../findWarmPath';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUserKey = getCompositeKeyForUser as jest.MockedFunction<typeof getCompositeKeyForUser>;
const mockPhoneKey = getCompositeKeyForPhone as jest.MockedFunction<typeof getCompositeKeyForPhone>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;

function graphReturning(paths: string[][]): { run: jest.Mock; close: jest.Mock } {
  const session = {
    run: jest.fn().mockResolvedValue({
      records: paths.map((keys) => ({ get: (): string[] => keys })),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  mockSession.mockReturnValue(session as never);
  return session;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserKey.mockResolvedValue('+995500000001');
  mockPhoneKey.mockResolvedValue('+995500000009');
  mockExcluded.mockResolvedValue([]);
  mockQuery.mockResolvedValue({
    rows: [
      { phone: '+995500000002', name: 'გია' },
      { phone: '+995500000003', name: 'ნინო' },
      { phone: '+995500000009', name: 'თარგეთი' },
    ],
    rowCount: 3,
  } as never);
});

// Ticket 11 Task 10 (D132): 2–3 hops, point-to-point, ONLY to an identified target.
describe('findWarmPath', () => {
  it('refuses to run without a target — discovery is not its job', async () => {
    const out = await findWarmPath('1', '');

    expect(out.found).toBe(false);
    expect((out as { reason: string }).reason).toBe('no_target');
    expect(mockSession).not.toHaveBeenCalled();
  });

  it('returns the bridges by name with their Netai state, fewest hops first, relayable first', async () => {
    graphReturning([
      ['+995500000001', '+995500000003', '+995500000009'],
      ['+995500000001', '+995500000002', '+995500000009'],
      ['+995500000001', '+995500000002', '+995500000003', '+995500000009'],
    ]);

    const out = await findWarmPath('1', '+995500000009');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.target).toEqual({ phone: '+995500000009', name: 'თარგეთი' });
    expect(out.paths.map((p) => [p.hops, p.relayable, p.bridges.map((b) => b.name)])).toEqual([
      [2, true, ['გია']],
      [2, false, ['ნინო']],
      [3, false, ['გია', 'ნინო']],
    ]);
    expect(out.paths[1].bridges[0].account_state).toBe('ally_account');
    expect(out.note).toContain('relay_ask');
  });

  it('walks the graph point-to-point, directed, capped at three hops', async () => {
    const session = graphReturning([['+995500000001', '+995500000002', '+995500000009']]);

    await findWarmPath('1', '+995500000009', 7);

    const [cypher, params] = session.run.mock.calls[0] as [string, Record<string, string>];
    expect(cypher).toContain('allShortestPaths((me)-[:CONTACT*1..3]->(t))');
    expect(params).toEqual({ userKey: '+995500000001', targetKey: '+995500000009' });
    expect(session.close).toHaveBeenCalled();
  });

  it('drops every path that runs through somebody the user blocked', async () => {
    mockExcluded.mockResolvedValue(['+995500000002']);
    graphReturning([['+995500000001', '+995500000002', '+995500000009']]);

    const out = await findWarmPath('1', '+995500000009');

    expect(out.found).toBe(false);
    expect((out as { reason: string }).reason).toBe('no_path_within_hops');
  });

  it('a graph outage is said out loud, never read as „no path"', async () => {
    mockSession.mockReturnValue({
      run: jest.fn().mockRejectedValue(new Error('down')),
      close: jest.fn().mockResolvedValue(undefined),
    } as never);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const out = await findWarmPath('1', '+995500000009');

    expect((out as { reason: string }).reason).toBe('neo4j_unavailable');
    spy.mockRestore();
  });

  it('a target nobody in the network holds has no path — the invite route', async () => {
    mockPhoneKey.mockRejectedValue(new Error('not found'));

    const out = await findWarmPath('1', '+995500000009');

    expect((out as { reason: string }).reason).toBe('target_not_in_graph');
  });
});
