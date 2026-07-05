jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../neo4j.keys', () => ({ getCompositeKeyForUser: jest.fn(), __esModule: true }));
jest.mock('../block.service', () => ({ getExcludedPhoneSet: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { getCompositeKeyForUser } from '../neo4j.keys';
import { getExcludedPhoneSet } from '../block.service';
import { getGroupConnectors, getTopConnectors } from '../graphAnalytics.service';
import { normalizePhone } from '../phone';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetKey = getCompositeKeyForUser as jest.MockedFunction<typeof getCompositeKeyForUser>;
const mockExcluded = getExcludedPhoneSet as jest.MockedFunction<typeof getExcludedPhoneSet>;

// neo4j-driver returns counts as Integer objects with .toNumber().
function neoInt(n: number): { toNumber: () => number } {
  return { toNumber: () => n };
}

function record(fields: Record<string, unknown>): { get: (k: string) => unknown } {
  return { get: (k: string) => fields[k] };
}

function fakeSession(records: Record<string, unknown>[]): {
  run: jest.Mock;
  close: jest.Mock;
} {
  return {
    run: jest.fn().mockResolvedValue({ records: records.map(record) }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExcluded.mockResolvedValue(new Set<string>());
});

describe('getTopConnectors', () => {
  it('ranks friends by reach and resolves names (Integer→number)', async () => {
    mockGetKey.mockResolvedValue('p1');
    const session = fakeSession([
      { phoneKey: 'pA', reach: neoInt(5) },
      { phoneKey: 'pB-pC', reach: neoInt(3) },
    ]);
    mockGetSession.mockReturnValue(session as unknown as ReturnType<typeof getSession>);
    mockQuery.mockResolvedValue(
      rows([
        { phone: 'pA', name: 'Alice' },
        { phone: 'pB', name: 'Bob' },
      ]) as never,
    );

    const result = await getTopConnectors('7');

    expect(result.found).toBe(true);
    expect(result.results).toEqual([
      { name: 'Alice', phone: 'pA', score: 5 },
      { name: 'Bob', phone: 'pB', score: 3 },
    ]);
    expect(session.run.mock.calls[0][1]).toEqual({ userKey: 'p1' });
    expect(session.close).toHaveBeenCalled();
  });

  it('drops blocked people from the ranking', async () => {
    const blockedPhone = '+995599000001';
    mockGetKey.mockResolvedValue('p1');
    mockGetSession.mockReturnValue(
      fakeSession([{ phoneKey: blockedPhone, reach: neoInt(5) }]) as unknown as ReturnType<
        typeof getSession
      >,
    );
    mockQuery.mockResolvedValue(rows([{ phone: blockedPhone, name: 'Alice' }]) as never);
    mockExcluded.mockResolvedValue(new Set([normalizePhone(blockedPhone)]));

    const result = await getTopConnectors('7');

    expect(result.found).toBe(false);
    expect(result.reason).toBe('no_connectors');
  });

  it('degrades gracefully when the user has no phone', async () => {
    mockGetKey.mockRejectedValue(new Error('No phones'));

    const result = await getTopConnectors('7');

    expect(result).toEqual({ found: false, reason: 'user_phone_not_found' });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('reports neo4j_unavailable and still closes the session on error', async () => {
    mockGetKey.mockResolvedValue('p1');
    const session = {
      run: jest.fn().mockRejectedValue(new Error('bolt down')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockGetSession.mockReturnValue(session as unknown as ReturnType<typeof getSession>);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await getTopConnectors('7');

    expect(result.reason).toBe('neo4j_unavailable');
    expect(session.close).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('getGroupConnectors', () => {
  function routeGroup(members: string[], names: { phone: string; name: string | null }[]): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserTags"')) {
        return Promise.resolve(rows(members.map((phone) => ({ phone }))) as never);
      }
      if (sql.includes('FROM "UserAlias"')) return Promise.resolve(rows(names) as never);
      throw new Error(`Unexpected query: ${sql}`);
    });
  }

  it('passes group phones to the graph and ranks bridges', async () => {
    routeGroup(['m1', 'm2'], [{ phone: 'pX', name: 'Bridge Bob' }]);
    mockGetKey.mockResolvedValue('p1');
    const session = fakeSession([{ phoneKey: 'pX', links: neoInt(4) }]);
    mockGetSession.mockReturnValue(session as unknown as ReturnType<typeof getSession>);

    const result = await getGroupConnectors('7', 'axel');

    expect(result.found).toBe(true);
    expect(result.results).toEqual([{ name: 'Bridge Bob', phone: 'pX', score: 4 }]);
    expect(session.run.mock.calls[0][1]).toEqual({ userKey: 'p1', groupPhones: ['m1', 'm2'] });
  });

  it('returns no_group_members when the tag matches nobody (no graph call)', async () => {
    routeGroup([], []);

    const result = await getGroupConnectors('7', 'nonexistent');

    expect(result).toEqual({ found: false, reason: 'no_group_members' });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('rejects a blank group tag', async () => {
    expect(await getGroupConnectors('7', '   ')).toEqual({ found: false, reason: 'no_group_tag' });
  });
});
