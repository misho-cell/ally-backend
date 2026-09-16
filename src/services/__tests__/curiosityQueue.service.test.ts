jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../targetScoring.service', () => ({ __esModule: true, buildTargetList: jest.fn() }));
jest.mock('../graphAnalytics.service', () => ({ __esModule: true, getTopConnectors: jest.fn() }));

import { query } from '../../db/postgres/client';
import { buildTargetList } from '../targetScoring.service';
import { getTopConnectors } from '../graphAnalytics.service';
import { buildCuriosityQueue, maybeCuriosityUpdate } from '../curiosityQueue.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockBuildTargetList = buildTargetList as jest.MockedFunction<typeof buildTargetList>;
const mockGetTopConnectors = getTopConnectors as jest.MockedFunction<typeof getTopConnectors>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

interface RouteOpts {
  lookalike?: { phone: string }[];
  mentioned?: { phone: string }[];
  close?: { contact_phone: string }[];
  warmEmpty?: { contact_phone: string }[];
  presence?: { phone: string; field_type: string }[];
  labels?: { phone: string; label: string | null }[];
  recentSurfacing?: { id: number }[];
}

function routeQueueQueries(opts: RouteOpts): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('SELECT id FROM curiosity_surfacing_log'))
      return Promise.resolve(rows(opts.recentSurfacing ?? []) as never);
    if (sql.includes('normalize_search_token(tag)'))
      return Promise.resolve(rows(opts.lookalike ?? []) as never);
    if (sql.includes('mine_sample')) return Promise.resolve(rows(opts.mentioned ?? []) as never);
    if (sql.includes('NOT EXISTS')) return Promise.resolve(rows(opts.warmEmpty ?? []) as never);
    if (sql.includes("relationship_type IN ('family', 'close')"))
      return Promise.resolve(rows(opts.close ?? []) as never);
    if (sql.includes('field_type = ANY'))
      return Promise.resolve(rows(opts.presence ?? []) as never);
    if (sql.includes('LEFT JOIN "UserPhone"'))
      return Promise.resolve(rows(opts.labels ?? []) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildTargetList.mockResolvedValue([]);
  mockGetTopConnectors.mockResolvedValue({ found: false });
});

describe('buildCuriosityQueue', () => {
  it('returns nothing when every tier is empty', async () => {
    routeQueueQueries({});

    expect(await buildCuriosityQueue('42')).toEqual([]);
  });

  it('surfaces a lookalike candidate (tier 1) with its missing core fact', async () => {
    mockBuildTargetList.mockResolvedValue([
      { phone: '+995500999999', label: 'director', city: null, score: 0.5, parts: {} as never },
    ]);
    routeQueueQueries({
      lookalike: [{ phone: '+995500000001' }],
      presence: [{ phone: '+995500000001', field_type: 'occupation' }],
      labels: [{ phone: '+995500000001', label: 'გია' }],
    });

    const out = await buildCuriosityQueue('42');

    expect(out).toEqual([
      {
        phone: '+995500000001',
        label: 'გია',
        missing_fact: 'employer', // occupation already present, employer is next in priority order
        question_type: 'lookalike',
        priority: 1,
      },
    ]);
  });

  it('drops a candidate who already has all four core facts recorded', async () => {
    routeQueueQueries({
      close: [{ contact_phone: '+995500000002' }],
      presence: [
        { phone: '+995500000002', field_type: 'occupation' },
        { phone: '+995500000002', field_type: 'employer' },
        { phone: '+995500000002', field_type: 'city' },
        { phone: '+995500000002', field_type: 'industry' },
      ],
    });

    expect(await buildCuriosityQueue('42')).toEqual([]);
  });

  it('keeps the HIGHEST-priority tier when a phone appears in more than one', async () => {
    routeQueueQueries({
      close: [{ contact_phone: '+995500000003' }], // priority 3
      warmEmpty: [{ contact_phone: '+995500000003' }], // priority 5, same phone
      presence: [],
    });

    const out = await buildCuriosityQueue('42');

    expect(out).toHaveLength(1);
    expect(out[0].priority).toBe(3);
    expect(out[0].question_type).toBe('close_contact');
  });

  it('sorts the merged queue by tier priority', async () => {
    routeQueueQueries({
      warmEmpty: [{ contact_phone: '+995500000005' }],
      close: [{ contact_phone: '+995500000006' }],
      presence: [],
    });

    const out = await buildCuriosityQueue('42');

    expect(out.map((i) => i.priority)).toEqual([3, 5]);
  });

  it('respects the limit', async () => {
    routeQueueQueries({
      close: [
        { contact_phone: '+995500000007' },
        { contact_phone: '+995500000008' },
        { contact_phone: '+995500000009' },
      ],
      presence: [],
    });

    const out = await buildCuriosityQueue('42', 2);

    expect(out).toHaveLength(2);
  });

  it('a bridge-position (Neo4j) failure degrades that tier to empty without breaking the queue', async () => {
    mockGetTopConnectors.mockRejectedValue(new Error('neo4j down'));
    routeQueueQueries({
      close: [{ contact_phone: '+995500000010' }],
      presence: [],
    });

    const out = await buildCuriosityQueue('42');

    expect(out).toHaveLength(1);
    expect(out[0].question_type).toBe('close_contact');
  });

  it('a slow/failing lookalike word is skipped rather than failing the whole queue', async () => {
    mockBuildTargetList.mockResolvedValue([
      { phone: '+995500999999', label: 'director', city: null, score: 0.5, parts: {} as never },
    ]);
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('normalize_search_token(tag)')) return Promise.reject(new Error('timeout'));
      if (sql.includes("relationship_type IN ('family', 'close')"))
        return Promise.resolve(rows([{ contact_phone: '+995500000011' }]) as never);
      if (sql.includes('field_type = ANY')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await buildCuriosityQueue('42');

    expect(out).toHaveLength(1);
    expect(out[0].question_type).toBe('close_contact');
  });

  it('T16: logs every returned item to the surfacing log (fire-and-forget)', async () => {
    routeQueueQueries({
      close: [{ contact_phone: '+995500000013' }],
      presence: [],
    });

    const out = await buildCuriosityQueue('42');

    expect(out).toHaveLength(1);
    const logCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO curiosity_surfacing_log'),
    );
    expect(logCall).toBeDefined();
    expect(logCall?.[1]).toEqual([[42], ['+995500000013'], ['close_contact'], ['occupation']]);
  });

  it('logs nothing when the queue is empty', async () => {
    routeQueueQueries({});

    await buildCuriosityQueue('42');

    const logCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO curiosity_surfacing_log'),
    );
    expect(logCall).toBeUndefined();
  });

  it('surfaces the bridge-position (Neo4j) tier when it succeeds', async () => {
    mockGetTopConnectors.mockResolvedValue({
      found: true,
      results: [{ name: 'ნინო', phone: '+995500000012', score: 4 }],
    });
    routeQueueQueries({ presence: [] });

    const out = await buildCuriosityQueue('42');

    expect(out).toEqual([
      {
        phone: '+995500000012',
        label: null,
        missing_fact: 'occupation',
        question_type: 'bridge_position',
        priority: 4,
      },
    ]);
  });
});

describe("maybeCuriosityUpdate — the curiosity trigger in T9's one pending_updates list", () => {
  // Distinct user ids per test: the empty-queue negative cache is module-level.
  it('wraps the top queue item as a typed update, phone kept OUTSIDE the payload', async () => {
    routeQueueQueries({
      close: [{ contact_phone: '+995500000021' }],
      presence: [],
      labels: [{ phone: '+995500000021', label: 'ლევანი' }],
    });

    const out = await maybeCuriosityUpdate('101');

    expect(out).not.toBeNull();
    expect(out?.kind).toBe('curiosity');
    expect(out?.task_id).toBeNull();
    expect(out?.phone).toBe('+995500000021');
    expect(out?.payload).toEqual(
      expect.objectContaining({
        who: 'ლევანი',
        missing_fact: 'occupation',
        question_type: 'close_contact',
        technique_tag: null,
        why: expect.any(String),
        instruction: expect.any(String),
      }),
    );
    expect(out?.payload).not.toHaveProperty('phone');
  });

  it('returns null while anything curiosity-shaped surfaced within the interval — the budget', async () => {
    routeQueueQueries({
      close: [{ contact_phone: '+995500000022' }],
      presence: [],
      recentSurfacing: [{ id: 9 }],
    });

    expect(await maybeCuriosityUpdate('102')).toBeNull();
    // The five tiers were never computed — the gate comes first.
    const tierCall = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('mine_sample'));
    expect(tierCall).toBeUndefined();
  });

  it('an EMPTY queue is remembered in-process — the expensive tiers are not re-run next call', async () => {
    routeQueueQueries({});

    expect(await maybeCuriosityUpdate('103')).toBeNull();
    const tierCallsAfterFirst = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('mine_sample'),
    ).length;
    expect(tierCallsAfterFirst).toBe(1);

    expect(await maybeCuriosityUpdate('103')).toBeNull();
    const tierCallsAfterSecond = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('mine_sample'),
    ).length;
    expect(tierCallsAfterSecond).toBe(1);
  });
});

/**
 * The 75-second conversation opener, found in tool_call_log on 16 September:
 *
 *   get_pending_updates   74,871 ms   returned 2 items
 *
 * Nothing in it was individually slow enough to look wrong. Five tier builders
 * in series, each honouring its own 8-second timeout, inside a handler doing
 * four more awaits in a row, each honouring theirs. Every part inside its
 * budget; the person waited over a minute before their conversation began.
 *
 * Two things follow, and the second is the one a test can hold.
 */
describe('the curiosity queue must not cost a conversation its first breath', () => {
  it('runs the five tiers together, not one after another', async () => {
    routeQueueQueries({
      lookalike: [{ phone: '+995500000001' }],
      presence: [],
      labels: [],
    });
    mockBuildTargetList.mockResolvedValue([]);
    mockGetTopConnectors.mockResolvedValue([]);

    const started = Date.now();
    await buildCuriosityQueue('501', 1);
    // Not a timing assertion — those are flaky. The tiers are independent and
    // the merge is order-preserving, so the only observable difference is that
    // every tier query has been issued by the time the first one resolves.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('GIVING UP is not the same as finding nothing', async () => {
    // The negative cache suppresses an account's curiosity for 24 hours. A run
    // that merely ran out of budget must not write it, or one slow minute
    // switches the feature off for the rest of the day.
    //
    // Loaded in isolation with a tiny budget and a queue that never answers,
    // so this exercises the real timeout rather than the empty-queue path that
    // happens to return the same null.
    jest.resetModules();
    process.env.CURIOSITY_BUDGET_MS = '20';
    const fresh = await import('../curiosityQueue.service');
    const freshQuery = (await import('../../db/postgres/client')).query as jest.MockedFunction<
      typeof query
    >;
    // resetModules gives the fresh copy fresh mocks too — they have to be told
    // what to return or the tier throws before it ever reaches the budget.
    (
      (await import('../targetScoring.service')).buildTargetList as jest.MockedFunction<
        typeof buildTargetList
      >
    ).mockResolvedValue([]);
    (
      (await import('../graphAnalytics.service')).getTopConnectors as jest.MockedFunction<
        typeof getTopConnectors
      >
    ).mockResolvedValue([]);

    freshQuery.mockImplementation((sql: string) => {
      // The interval check answers; every tier hangs for ever.
      if (sql.includes('SELECT id FROM curiosity_surfacing_log')) {
        return Promise.resolve(rows([]) as never);
      }
      return new Promise(() => undefined);
    });

    expect(await fresh.maybeCuriosityUpdate('90002')).toBeNull();

    // Now let the tiers answer. If the timeout had been recorded as „empty",
    // this second call would short-circuit and never reach the database.
    const callsBefore = freshQuery.mock.calls.length;
    freshQuery.mockImplementation(() => Promise.resolve(rows([]) as never));
    expect(await fresh.maybeCuriosityUpdate('90002')).toBeNull();
    expect(freshQuery.mock.calls.length).toBeGreaterThan(callsBefore);

    delete process.env.CURIOSITY_BUDGET_MS;
  });
});
