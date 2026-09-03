jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { findUnmetNeeds } from '../unmetNeeds.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

// Routes the three query shapes: the review-account lookup, the merged topics
// query, and the per-word candidate lookups.
function routeQueries(opts: {
  topics?: {
    query: string;
    netai_count: string | null;
    old_ally_count: string | null;
    city: string | null;
  }[];
  tags?: { phone: string; tag: string }[];
  aliases?: { phone: string; alias: string }[];
  testUserIds?: { userId: number }[];
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM "UserPhone"') && sql.includes('"userId"'))
      return Promise.resolve(rows(opts.testUserIds ?? []) as never);
    if (sql.includes('FROM search_activity'))
      return Promise.resolve(rows(opts.topics ?? []) as never);
    if (sql.includes('FROM "UserTags"')) return Promise.resolve(rows(opts.tags ?? []) as never);
    if (sql.includes('FROM "UserAlias"')) return Promise.resolve(rows(opts.aliases ?? []) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findUnmetNeeds', () => {
  it('returns no topics when nothing failed', async () => {
    routeQueries({});

    const out = await findUnmetNeeds(30);

    expect(out).toEqual([]);
  });

  it('attaches non-member candidates matched by tag or alias, with per-source counts', async () => {
    routeQueries({
      topics: [{ query: 'Wissol manager', netai_count: '2', old_ally_count: '1', city: 'თბილისი' }],
      tags: [{ phone: '+995500000001', tag: 'Wissol' }],
      aliases: [{ phone: '+995500000002', alias: 'Wissol მენეჯერი' }],
    });

    const out = await findUnmetNeeds(30);

    expect(out).toEqual([
      {
        query: 'Wissol manager',
        ask_count: 3,
        sources: { netai: 2, old_ally: 1 },
        city: 'თბილისი',
        candidates: expect.arrayContaining([
          { phone: '+995500000001', label: 'Wissol', source: 'tag' },
          { phone: '+995500000002', label: 'Wissol მენეჯერი', source: 'alias' },
        ]),
      },
    ]);
  });

  it('excludes members — every candidate query filters out registered UserPhone rows', async () => {
    routeQueries({
      topics: [{ query: 'Rompetrol', netai_count: '1', old_ally_count: null, city: null }],
    });

    await findUnmetNeeds(30);

    const candidateQueries = mockQuery.mock.calls.filter(
      ([sql]) =>
        (sql as string).includes('FROM "UserTags"') || (sql as string).includes('FROM "UserAlias"'),
    );
    expect(candidateQueries.length).toBeGreaterThan(0);
    for (const [sql] of candidateQueries) {
      expect(sql as string).toContain('NOT EXISTS (SELECT 1 FROM "UserPhone"');
    }
  });

  it('Task 4 item 2: candidates match on WHOLE label tokens, never a similar fragment', async () => {
    routeQueries({
      topics: [{ query: 'ვეტერინარი', netai_count: '2', old_ally_count: null, city: null }],
    });

    await findUnmetNeeds(30);

    const candidateQueries = mockQuery.mock.calls.filter(
      ([sql]) =>
        (sql as string).includes('FROM "UserTags"') || (sql as string).includes('FROM "UserAlias"'),
    );
    expect(candidateQueries.length).toBeGreaterThan(0);
    for (const [sql] of candidateQueries) {
      // The exact-token gate (the "eteri"/"bus"/"synergy" killer) plus the
      // deterministic ordering Task 4's stable-read requirement needs.
      expect(sql as string).toContain('= ANY');
      expect(sql as string).toContain('regexp_split_to_array');
      expect(sql as string).toContain('ORDER BY');
    }
  });

  it('Task 4 item 3: review/test-account searches are excluded from both demand sources', async () => {
    routeQueries({
      topics: [],
      testUserIds: [{ userId: 170748 }, { userId: 170749 }],
    });
    const oldEnv = process.env.REVIEW_PHONE;
    process.env.REVIEW_PHONE = '+995555000003,+995555000004';
    try {
      await findUnmetNeeds(30);
    } finally {
      process.env.REVIEW_PHONE = oldEnv;
    }

    const topicsCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM search_activity'),
    );
    expect(topicsCall).toBeDefined();
    const [sql, params] = topicsCall as [string, unknown[]];
    expect(sql).toContain('sa.user_id != ALL');
    expect(sql).toContain('sh."originUserId" != ALL');
    expect(params?.[1]).toEqual(['170748', '170749']);
    expect(params?.[2]).toEqual([170748, 170749]);
  });

  it('skips bare number/phone topics — a digits-only lookup is not an occupation need', async () => {
    routeQueries({ topics: [] });

    await findUnmetNeeds(30);

    const topicsCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM search_activity'),
    );
    const [sql] = topicsCall as [string];
    // Both branches require at least one letter in the query text.
    expect((sql.match(/~ '\[a-zა-ჿA-Z\]'/g) ?? []).length).toBe(2);
  });

  it('skips noise words shorter than the minimum length', async () => {
    routeQueries({
      topics: [{ query: 'a it', netai_count: '1', old_ally_count: null, city: null }],
    });

    const out = await findUnmetNeeds(30);

    expect(out).toEqual([
      {
        query: 'a it',
        ask_count: 1,
        sources: { netai: 1, old_ally: 0 },
        city: null,
        candidates: [],
      },
    ]);
    const candidateQueries = mockQuery.mock.calls.filter(
      ([sql]) =>
        (sql as string).includes('FROM "UserTags"') || (sql as string).includes('FROM "UserAlias"'),
    );
    expect(candidateQueries).toHaveLength(0);
  });

  it('passes the lookback window through as an interval, not string concatenation', async () => {
    routeQueries({});

    await findUnmetNeeds(90);

    const topicsCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM search_activity'),
    );
    const [sql, params] = topicsCall as [string, unknown[]];
    expect(sql).toContain('make_interval(days =>');
    expect(params?.[0]).toBe(90);
  });

  it("T5: unions in old-Ally's SearchHistory (still-live, disconnected until now) alongside search_activity", async () => {
    routeQueries({});

    await findUnmetNeeds(30);

    const topicsCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM search_activity'),
    );
    const [sql] = topicsCall as [string];
    expect(sql).toContain('FROM "SearchHistory"');
    expect(sql).toContain('"foundExactMatch" = false');
    expect(sql).toContain('u.id = sh."originUserId"');
    // One combined query, not a second round-trip.
    const topicQueries = mockQuery.mock.calls.filter(([s]) =>
      (s as string).includes('FROM search_activity'),
    );
    expect(topicQueries).toHaveLength(1);
  });
});

describe('findUnmetNeeds — topics run in batches (ticket 9 task 28.5)', () => {
  it('keeps each topic with its OWN candidates and in the query order, across batch boundaries', async () => {
    // Seven topics with a batch size of five, so the seam is exercised.
    const topics = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg'].map((q) => ({
      query: q,
      netai_count: '1',
      old_ally_count: '0',
      city: null,
    }));
    // Each word gets its own candidate, so a misaligned batch is visible.
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM "UserPhone"') && sql.includes('"userId"'))
        return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM search_activity')) return Promise.resolve(rows(topics) as never);
      if (sql.includes('FROM "UserTags"')) {
        const word = String((params ?? [])[0]);
        return Promise.resolve(rows([{ phone: `+9955000000${word}`, tag: word }]) as never);
      }
      return Promise.resolve(rows([]) as never);
    });

    const out = await findUnmetNeeds(30);

    expect(out.map((t) => t.query)).toEqual(['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg']);
    for (const topic of out) {
      expect(topic.candidates).toEqual([
        { phone: `+9955000000${topic.query}`, label: topic.query, source: 'tag' },
      ]);
    }
  });

  it('runs a batch concurrently rather than one topic after another', async () => {
    const topics = ['aaa', 'bbb', 'ccc'].map((q) => ({
      query: q,
      netai_count: '1',
      old_ally_count: '0',
      city: null,
    }));
    let inFlight = 0;
    let peak = 0;
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserPhone"') && sql.includes('"userId"'))
        return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM search_activity')) return Promise.resolve(rows(topics) as never);
      inFlight++;
      peak = Math.max(peak, inFlight);
      return new Promise((resolve) => {
        setImmediate(() => {
          inFlight--;
          resolve(rows([]) as never);
        });
      });
    });

    await findUnmetNeeds(30);

    // Serially this would never exceed the two queries of a single topic.
    expect(peak).toBeGreaterThan(2);
  });
});
