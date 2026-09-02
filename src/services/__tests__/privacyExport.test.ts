jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  __esModule: true,
}));
jest.mock('../../db/neo4j/client', () => ({
  __esModule: true,
  getSession: () => ({
    run: jest.fn().mockResolvedValue({ records: [] }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { query, withTransaction } from '../../db/postgres/client';
import { exportMyData, getMyDataSummary, deleteMyAccount } from '../privacyRights.service';

const mockTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

// This export is the answer to a person asking what we hold about them. Its
// failure mode matters as much as its content: a table we could not read must
// never come back looking like a table with nothing in it.
describe('exportMyData — a table we could not read is never reported as empty', () => {
  beforeEach(() => jest.clearAllMocks());

  function route(onOwnedTable: (table: string) => Promise<unknown>): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('information_schema.columns'))
        return Promise.resolve(rows([{ column_name: 'id' }, { column_name: 'name' }]) as never);
      if (sql.includes('FROM "User" WHERE id = $1'))
        return Promise.resolve(rows([{ id: 1, name: 'ნინო' }]) as never);
      const table = /FROM (\w+) WHERE/.exec(sql)?.[1] ?? '';
      return onOwnedTable(table) as Promise<never>;
    });
  }

  it('marks a table unavailable when its read fails, instead of dropping it silently', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    route((table) =>
      table === 'user_notes'
        ? Promise.reject(new Error('canceling statement due to statement timeout'))
        : Promise.resolve(rows([])),
    );

    const data = await exportMyData('1');

    expect(data.user_notes).toEqual({ rows: [], truncated: false, unavailable: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('stays silent about a table that does not exist in this environment', async () => {
    const missing = Object.assign(new Error('relation "user_avatars" does not exist'), {
      code: '42P01',
    });
    route((table) =>
      table === 'user_avatars' ? Promise.reject(missing) : Promise.resolve(rows([])),
    );

    const data = await exportMyData('1');

    expect(data).not.toHaveProperty('user_avatars');
  });

  it('returns the rows of a table that reads cleanly', async () => {
    route((table) =>
      table === 'user_notes'
        ? Promise.resolve(rows([{ id: 1, text: 'შენიშვნა' }]))
        : Promise.resolve(rows([])),
    );

    const data = await exportMyData('1');

    expect(data.user_notes).toEqual({
      rows: [{ id: 1, text: 'შენიშვნა' }],
      truncated: false,
    });
  });
});

// The same failure mode one function up: this summary is also the preview a
// person is shown before they confirm a deletion, so a category we could not
// read must never be presented as a category they have nothing in.
describe('getMyDataSummary — an uncountable category is named, not dropped', () => {
  beforeEach(() => jest.clearAllMocks());

  it('separates categories that failed to read from categories that are empty', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockImplementation((sql: string) => {
      const table = /FROM (\S+) WHERE/.exec(sql)?.[1] ?? '';
      if (table === 'user_notes')
        return Promise.reject(new Error('canceling statement due to statement timeout')) as never;
      if (table === 'conversations') return Promise.resolve(rows([{ count: '12' }]) as never);
      return Promise.resolve(rows([{ count: '0' }]) as never);
    });

    const out = await getMyDataSummary('1');

    expect(out.counts.conversations).toBe(12);
    expect(out.uncounted).toContain('user_notes');
    // A read failure never becomes a number.
    expect(out.counts).not.toHaveProperty('user_notes');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('says nothing about a table this environment does not have', async () => {
    const missing = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    mockQuery.mockImplementation((sql: string) => {
      const table = /FROM (\S+) WHERE/.exec(sql)?.[1] ?? '';
      if (table === 'user_avatars') return Promise.reject(missing) as never;
      return Promise.resolve(rows([{ count: '0' }]) as never);
    });

    const out = await getMyDataSummary('1');

    expect(out.uncounted).not.toContain('user_avatars');
  });
});

// The erasure ran DELETE FROM contact_enrichment WHERE user_id = $1 against a
// table that has no user_id column — one wrong pair in a 33-entry list, and
// Postgres aborted the whole transaction. Every account deletion in production
// was failing: the person clicked delete, got a 500, and their data stayed.
describe('deleteMyAccount — one wrong column must not abort the erasure', () => {
  beforeEach(() => jest.clearAllMocks());

  it('skips a table whose column is missing, reports it, and deletes the rest', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const deleted: string[] = [];
    const client = {
      query: jest.fn((sql: string) => {
        if (sql.includes('information_schema.tables'))
          return Promise.resolve(
            rows([{ table_name: 'conversations' }, { table_name: 'contact_enrichment' }]),
          );
        if (sql.includes('information_schema.columns') && sql.includes('table_name, column_name'))
          // contact_enrichment exists but has no user_id — the live shape.
          return Promise.resolve(
            rows([
              { table_name: 'conversations', column_name: 'user_id' },
              { table_name: 'contact_enrichment', column_name: 'phone' },
            ]),
          );
        if (sql.includes('information_schema.columns')) return Promise.resolve(rows([]));
        if (sql.startsWith('DELETE FROM') || sql.includes('DELETE FROM')) {
          deleted.push(sql);
          return Promise.resolve({ rows: [], rowCount: 3 });
        }
        return Promise.resolve(rows([]));
      }),
    };
    mockTransaction.mockImplementation(async (cb: (c: unknown) => Promise<unknown>) => cb(client));
    mockQuery.mockResolvedValue(rows([{ phone: '+995599000001' }]) as never);

    const report = await deleteMyAccount('1');

    // The conversations delete still ran...
    expect(deleted.some((sql) => sql.includes('FROM conversations'))).toBe(true);
    // ...and contact_enrichment was cleared by PHONE, not skipped entirely.
    expect(deleted.some((sql) => sql.includes('contact_enrichment') && sql.includes('phone'))).toBe(
      true,
    );
    // A user_id delete against it must never be attempted again.
    expect(
      deleted.some((sql) => sql.includes('contact_enrichment') && sql.includes('user_id')),
    ).toBe(false);
    expect(report.dryRun).toBe(false);
    consoleSpy.mockRestore();
  });
});

// The second blocker, found only by running a real deletion: the scrub set
// every personal column to NULL, and "name" is NOT NULL in production. The
// not-null violation rolled the whole erasure back — the account survived and
// the person was told the deletion failed.
describe('deleteMyAccount — a NOT NULL personal column is emptied, not nulled', () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes '' for NOT NULL text columns and NULL for the rest", async () => {
    let scrubSql = '';
    const client = {
      query: jest.fn((sql: string) => {
        if (sql.includes('information_schema.tables')) return Promise.resolve(rows([]));
        if (sql.includes('is_nullable'))
          return Promise.resolve(
            rows([
              { column_name: 'name', is_nullable: 'NO', data_type: 'character varying' },
              { column_name: 'password', is_nullable: 'NO', data_type: 'character varying' },
              { column_name: 'city', is_nullable: 'YES', data_type: 'character varying' },
              {
                column_name: 'birthday',
                is_nullable: 'NO',
                data_type: 'timestamp without time zone',
              },
            ]),
          );
        if (sql.includes('information_schema.columns')) return Promise.resolve(rows([]));
        if (sql.includes('UPDATE "User" SET')) {
          scrubSql = sql;
          return Promise.resolve(rows([]));
        }
        return Promise.resolve(rows([]));
      }),
    };
    mockTransaction.mockImplementation(async (cb: (c: unknown) => Promise<unknown>) => cb(client));
    mockQuery.mockResolvedValue(rows([{ phone: '+995599000001' }]) as never);

    const report = await deleteMyAccount('1');

    expect(scrubSql).toContain(`"name" = ''`);
    expect(scrubSql).toContain(`"password" = ''`);
    expect(scrubSql).toContain('"city" = NULL');
    // A NOT NULL column that cannot hold '' is reported, never guessed at.
    expect(scrubSql).not.toContain('"birthday"');
    expect(Object.keys(report.rowsDeleted).some((k) => k.includes('columns NOT scrubbed'))).toBe(
      true,
    );
  });
});
