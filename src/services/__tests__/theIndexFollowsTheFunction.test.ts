jest.mock('../../db/postgres/client', () => ({ __esModule: true, backgroundQuery: jest.fn() }));

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { backgroundQuery } from '../../db/postgres/client';
import { NORMALIZED_INDEXES, startSearchIndexRebuild } from '../searchIndexRebuild.service';

const mockQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;

const FOLDING_DEF = "translate(coalesce(input, ''), 'ᲐᲑᲒ', 'აბგ')";
const OLD_DEF = "translate(lower(coalesce(input, '')), 'აბგ', 'abg')";

function liveFunction(def: string): void {
  mockQuery.mockImplementation((sql: string) =>
    Promise.resolve(
      (String(sql).includes('pg_get_functiondef')
        ? { rows: [{ def }], rowCount: 1 }
        : { rows: [], rowCount: 0 }) as never,
    ),
  );
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Row 278 / §70: the rebuild follows migration 184, never precedes it. */
describe('the index is rebuilt after the function, and all three of them', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses while the live function does not fold capitals yet', async () => {
    liveFunction(OLD_DEF);
    await expect(startSearchIndexRebuild()).resolves.toBe('function_not_folding');
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('REINDEX'))).toBe(false);
  });

  it('rebuilds every index built on the function, one at a time, concurrently', async () => {
    liveFunction(FOLDING_DEF);
    await expect(startSearchIndexRebuild()).resolves.toEqual({
      started: true,
      indexes: NORMALIZED_INDEXES,
    });
    await flush();
    await flush();
    const reindexes = mockQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.startsWith('REINDEX'));
    expect(reindexes).toEqual(NORMALIZED_INDEXES.map((i) => `REINDEX INDEX CONCURRENTLY ${i}`));
    expect(NORMALIZED_INDEXES).toContain('idx_user_name_norm_trgm');
  });

  it('names a failure loudly and lets the next attempt start', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockImplementation((sql: string) =>
      String(sql).startsWith('REINDEX')
        ? Promise.reject(new Error('disk full'))
        : Promise.resolve({ rows: [{ def: FOLDING_DEF }], rowCount: 1 } as never),
    );
    await startSearchIndexRebuild();
    await flush();
    expect(String(error.mock.calls[0]?.[0])).toContain('_ccnew');
    await expect(startSearchIndexRebuild()).resolves.not.toBe('already_running');
    error.mockRestore();
  });

  it('migration 184 is scheduled, and names the third index', () => {
    const dir = join(__dirname, '..', '..', 'db', 'postgres', 'migrations');
    expect(readdirSync(dir)).toContain('184_a_name_in_capitals_is_still_the_same_name.sql');
    const sql = readFileSync(
      join(dir, '184_a_name_in_capitals_is_still_the_same_name.sql'),
      'utf8',
    );
    expect(sql).toContain('idx_user_name_norm_trgm');
    expect(sql).toContain('ᲐᲑᲒᲓᲔᲕ');
  });
});
