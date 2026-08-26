jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../targetScoring.service', () => ({ __esModule: true, buildTargetList: jest.fn() }));
jest.mock('../graphAnalytics.service', () => ({ __esModule: true, getTopConnectors: jest.fn() }));

import { query } from '../../db/postgres/client';
import { buildTargetList } from '../targetScoring.service';
import { getTopConnectors } from '../graphAnalytics.service';
import { buildCuriosityQueue } from '../curiosityQueue.service';

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
}

function routeQueueQueries(opts: RouteOpts): void {
  mockQuery.mockImplementation((sql: string) => {
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
