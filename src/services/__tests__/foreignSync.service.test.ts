jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  backgroundQuery: jest.fn(),
  __esModule: true,
}));
jest.mock('../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../neo4j.keys', () => ({
  getCompositeKeyForUser: jest.fn().mockResolvedValue('501-key'),
  getCompositeKeyForPhone: jest.fn().mockImplementation((p: string) => Promise.resolve(`${p}-key`)),
  __esModule: true,
}));

import { query, backgroundQuery } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { previewForeignSyncLinks, removeForeignSyncLinks } from '../foreignSync.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockBackgroundQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

function mockNeo4jSession(relationshipsDeleted: number): { run: jest.Mock; close: jest.Mock } {
  const session = {
    run: jest.fn().mockResolvedValue({
      summary: { counters: { updates: () => ({ relationshipsDeleted }) } },
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  mockGetSession.mockReturnValue(session as never);
  return session;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('previewForeignSyncLinks — the pure read the founder reviews', () => {
  it('returns the byte-identical pairs with counts, and never writes', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { phone: '+995500000001', alias: 'Dato Q7 Xelosani' },
        { phone: '+995500000001', alias: 'Dato Q7' },
        { phone: '+995500000002', alias: 'Beso Fiat' },
      ]) as never,
    );

    const out = await previewForeignSyncLinks('501', '118509');

    expect(out).toEqual({
      count: 3,
      distinct_phones: 2,
      links: expect.arrayContaining([{ phone: '+995500000002', alias: 'Beso Fiat' }]),
    });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('SELECT');
    expect(sql as string).not.toContain('DELETE');
    expect(mockBackgroundQuery).not.toHaveBeenCalled();
  });
});

describe('removeForeignSyncLinks — the founder-gated execute', () => {
  function routeRemovalQueries(opts: {
    deletedPhones?: string[];
    orphans?: string[];
    tagsRemoved?: number;
  }): void {
    mockBackgroundQuery.mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM "UserAlias"'))
        return Promise.resolve(
          rows((opts.deletedPhones ?? []).map((phone) => ({ phone }))) as never,
        );
      if (sql.includes('UNNEST'))
        return Promise.resolve(rows((opts.orphans ?? []).map((phone) => ({ phone }))) as never);
      if (sql.includes('DELETE FROM "UserTags"'))
        return Promise.resolve(rows([], opts.tagsRemoved ?? 0) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('deletes only the byte-identical alias rows and reports zero-work honestly', async () => {
    routeRemovalQueries({ deletedPhones: [] });

    const out = await removeForeignSyncLinks('501', '118509');

    expect(out).toEqual({
      aliases_removed: 0,
      orphaned_contacts: 0,
      tags_removed: 0,
      edges_removed: 0,
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('a contact left with NO remaining alias loses tags, derived views and the graph edge', async () => {
    mockNeo4jSession(2);
    routeRemovalQueries({
      deletedPhones: ['+995500000001', '+995500000002', '+995500000002'],
      orphans: ['+995500000001', '+995500000002'],
      tagsRemoved: 5,
    });

    const out = await removeForeignSyncLinks('501', '118509');

    expect(out).toEqual({
      aliases_removed: 3,
      orphaned_contacts: 2,
      tags_removed: 5,
      edges_removed: 2,
    });
    const tagDelete = mockBackgroundQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('DELETE FROM "UserTags"'),
    );
    expect(tagDelete?.[1]).toEqual(['501', ['+995500000001', '+995500000002']]);
  });

  it("a contact that still has one of the user's OWN aliases keeps its tags and edge — only the synced duplicate row went", async () => {
    mockNeo4jSession(0);
    routeRemovalQueries({
      deletedPhones: ['+995500000003'],
      orphans: [], // his own alias remains, so the phone is not orphaned
    });

    const out = await removeForeignSyncLinks('501', '118509');

    expect(out.aliases_removed).toBe(1);
    expect(out.orphaned_contacts).toBe(0);
    const tagDelete = mockBackgroundQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('DELETE FROM "UserTags"'),
    );
    expect(tagDelete).toBeUndefined();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('a failed graph chunk is logged and skipped — Postgres removal already stands, the count just omits it', async () => {
    const session = mockNeo4jSession(0);
    session.run.mockRejectedValue(new Error('neo4j down'));
    routeRemovalQueries({
      deletedPhones: ['+995500000004'],
      orphans: ['+995500000004'],
      tagsRemoved: 1,
    });

    const out = await removeForeignSyncLinks('501', '118509');

    expect(out.aliases_removed).toBe(1);
    expect(out.edges_removed).toBe(0);
  });
});
