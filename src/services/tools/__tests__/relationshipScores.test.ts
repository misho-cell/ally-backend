jest.mock('../../../db/postgres/client', () => ({
  query: jest.fn(),
  backgroundQuery: jest.fn(),
  __esModule: true,
}));

import { query, backgroundQuery } from '../../../db/postgres/client';
import {
  fetchRelationshipForPhones,
  fetchHumanTierForPhones,
  backfillHumanRelationshipTiers,
} from '../relationshipScores';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockBackgroundQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchHumanTierForPhones', () => {
  it('reads human_relationship_tiers, scoped to the user — a separate table from the machine-computed scores, ticket 6 task 4', async () => {
    mockQuery.mockResolvedValue(rows([{ contact_phone: '+995500000001', tier: 'green' }]) as never);

    const out = await fetchHumanTierForPhones('501', ['+995500000001']);

    expect(out.get('+995500000001')).toBe('green');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('FROM human_relationship_tiers');
    expect(params).toEqual(['501', ['+995500000001']]);
  });

  it('returns an empty map for an empty phone list without querying', async () => {
    const out = await fetchHumanTierForPhones('501', []);
    expect(out.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fails soft to an empty map, never throws — a search must never break because this table has a problem', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));

    const out = await fetchHumanTierForPhones('501', ['+995500000001']);

    expect(out.size).toBe(0);
  });

  it('never touches contact_relationship_scores — the two must stay on separate reads so a hand-set tier can never be confused with a computed one', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await fetchHumanTierForPhones('501', ['+995500000001']);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('contact_relationship_scores');
  });
});

describe('backfillHumanRelationshipTiers', () => {
  it("walks UserConnectionPhone in bounded id-range batches on the BACKGROUND pool — live-caught 25 Aug: the original single unbounded query ran on the default pool's 8s statement_timeout and crashed the app", async () => {
    mockBackgroundQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)'))
        return Promise.resolve({ rows: [{ max: 62_500 }], rowCount: 1 } as never);
      return Promise.resolve({ rows: [], rowCount: 10_000 } as never);
    });

    const out = await backfillHumanRelationshipTiers();

    // 62,500 / 25,000 batch size = 3 batches (0-25k, 25k-50k, 50k-62.5k+).
    expect(out.batches).toBe(3);
    expect(out.inserted).toBe(30_000);
    expect(out.maxId).toBe(62_500);
    expect(out.skippedRanges).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('each batch query stays inside one 25,000-id window, never the whole table', async () => {
    mockBackgroundQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)'))
        return Promise.resolve({ rows: [{ max: 37_500 }], rowCount: 1 } as never);
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    });

    await backfillHumanRelationshipTiers();

    const insertCalls = mockBackgroundQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT INTO human_relationship_tiers'),
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0][1]).toEqual([0, 25_000]);
    expect(insertCalls[1][1]).toEqual([25_000, 50_000]);
  });

  it('does nothing when the table is empty', async () => {
    mockBackgroundQuery.mockResolvedValue({ rows: [{ max: null }], rowCount: 1 } as never);

    const out = await backfillHumanRelationshipTiers();

    expect(out).toEqual({ batches: 0, inserted: 0, maxId: 0, skippedRanges: [] });
  });

  it('a batch that fails once is retried and its retry counts — a transient stall must not skip data (live-caught 26 Aug: two real runs died on intermittent statement timeouts)', async () => {
    let failedOnce = false;
    mockBackgroundQuery.mockImplementation((sql: string) => {
      if (sql.includes('MAX(id)'))
        return Promise.resolve({ rows: [{ max: 25_000 }], rowCount: 1 } as never);
      if (!failedOnce) {
        failedOnce = true;
        return Promise.reject(new Error('canceling statement due to statement timeout'));
      }
      return Promise.resolve({ rows: [], rowCount: 7 } as never);
    });

    const out = await backfillHumanRelationshipTiers();

    expect(out).toEqual({ batches: 1, inserted: 7, maxId: 25_000, skippedRanges: [] });
  });

  it('a batch that fails twice is SKIPPED with its range recorded, and the job still reaches the end', async () => {
    mockBackgroundQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('MAX(id)'))
        return Promise.resolve({ rows: [{ max: 50_000 }], rowCount: 1 } as never);
      if ((params as number[])[0] === 0) {
        return Promise.reject(new Error('canceling statement due to statement timeout'));
      }
      return Promise.resolve({ rows: [], rowCount: 5 } as never);
    });

    const out = await backfillHumanRelationshipTiers();

    expect(out.batches).toBe(2);
    expect(out.inserted).toBe(5); // second batch's rows still landed
    expect(out.skippedRanges).toEqual(['0-25000']);
  });
});

describe('fetchRelationshipForPhones (unchanged — stays reading only the machine table)', () => {
  it('reads contact_relationship_scores, not human_relationship_tiers', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { contact_phone: '+995500000001', relationship_type: 'close', strength_score: 0.8 },
      ]) as never,
    );

    const out = await fetchRelationshipForPhones('501', ['+995500000001']);

    expect(out.get('+995500000001')).toEqual({ relationship: 'close', strength: 0.8 });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('FROM contact_relationship_scores');
    expect(sql).not.toContain('human_relationship_tiers');
  });
});
