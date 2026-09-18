/**
 * Ticket 20 row 108 — which pool a query draws from.
 *
 * MEASURED, 18 September 18:46. Thirteen second-degree searches on a container
 * that had been up half an hour and had already served a 22-search sweep. The
 * pool at the END of every one of the thirteen, without exception:
 *
 *   total 10 / 0 idle / 3 to 24 waiting
 *
 * Ten is the max. Zero idle. Up to twenty-four queued. It grew to its ceiling
 * and stopped there — which killed the „the pool keeps discarding its
 * connections" theory I had been holding an hour before — and it was not a
 * slow database either: Neo4j, which does not go through this pool, sat flat
 * at 1,180 to 1,235 ms across the whole burst.
 *
 * What was queued is the point. In the sweep before it, sixty-one of the
 * sixty-two slow queries were small lookups — human_relationship_tiers,
 * contact_exclusions, person_identities — at 3.1 to 3.7 seconds each against
 * the 150 to 700 ms they cost all day, dozens of them finishing on the same
 * millisecond. They are not slow. They were behind a handful of fifteen-second
 * searches holding nine of the ten connections.
 *
 * So the split is by how long a query is ALLOWED to take, which is the only
 * thing knowable about it before it runs — and, after the correction below,
 * by whether that is LONGER than the default rather than merely different.
 * These tests hold that routing, because it is invisible at the call site:
 * every caller still writes `query(sql, params, timeout)` and cannot see
 * which pool answered.
 */
interface FakePool {
  readonly label: string;
  query: jest.Mock;
  connect: jest.Mock;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

const pools: FakePool[] = [];

jest.mock('pg', () => ({
  __esModule: true,
  Pool: jest.fn().mockImplementation((config: { max?: number }) => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    };
    const created: FakePool = {
      label: `max=${config.max ?? '?'}#${pools.length}`,
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue(client),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
    pools.push(created);
    return created;
  }),
}));

import { backgroundQuery, poolPressure, query } from '../client';

// Construction order in client.ts: the short pool, then the long one, then the
// background one. Named here so a reordering breaks these tests loudly rather
// than silently testing the wrong pool.
const [shortPool, longPool, backgroundPool] = pools;

beforeEach(() => {
  for (const p of pools) {
    p.query.mockClear();
    p.connect.mockClear();
  }
});

describe('which pool answers a query', () => {
  it('builds three pools: the short one, the long one, and the background one', () => {
    expect(pools).toHaveLength(3);
    expect(shortPool).toBeDefined();
    expect(longPool).toBeDefined();
    expect(backgroundPool).toBeDefined();
  });

  it('sends an ordinary query to the SHORT pool, in one round trip', async () => {
    await query('SELECT contact_phone, tier FROM human_relationship_tiers WHERE x = $1', [1]);

    expect(shortPool.query).toHaveBeenCalledTimes(1);
    // No checkout: the default statement_timeout rides on the connection, and
    // that is the whole reason the hot path is one round trip.
    expect(shortPool.connect).not.toHaveBeenCalled();
    expect(longPool.query).not.toHaveBeenCalled();
    expect(longPool.connect).not.toHaveBeenCalled();
  });

  it('sends a query that asked for its own timeout to the LONG pool', async () => {
    await query('WITH mine AS MATERIALIZED (SELECT phone FROM "UserTags")', [1], 15_000);

    // It borrows a client, because the timeout rides on the connection.
    expect(longPool.connect).toHaveBeenCalledTimes(1);
    // And the short pool is untouched, which is the entire point: a 50 ms
    // lookup no longer stands behind a fifteen-second search.
    expect(shortPool.query).not.toHaveBeenCalled();
    expect(shortPool.connect).not.toHaveBeenCalled();
  });

  it('treats a custom timeout equal to the default as ordinary', async () => {
    // taskPlans passes 8_000 explicitly, which IS the default. It is not a long
    // query and must not be routed as one.
    await query('UPDATE tasks SET plan = plan_proposed', [1], 8_000);

    expect(shortPool.query).toHaveBeenCalledTimes(1);
    expect(longPool.connect).not.toHaveBeenCalled();
  });

  /**
   * The assertion this file got WRONG on its first pass, and the burst that
   * corrected it.
   *
   * I wrote „a shorter custom timeout goes to the long pool too, and that is
   * fine" and shipped it. On the next fourteen-search burst, `touched` and
   * `states` — which take the default — fell from 544-5,395 and 696-5,701 ms
   * to 144-152 and 195-257, every single one. `excl` went on climbing to
   * 3,408 ms. `excl` is a 5,000 ms lookup on a small table, and my rule had
   * filed it as a long query and parked it behind fourteen fifteen-second
   * searches.
   *
   * A timeout below the default is a query asking to be quick. It belongs
   * with the quick ones.
   */
  it('keeps a SHORTER custom timeout on the short pool — it is not a long query', async () => {
    await query('SELECT contact_phone, excluded_for FROM contact_exclusions', [1], 5_000);

    // It still borrows a client, because the timeout rides on the connection.
    expect(shortPool.connect).toHaveBeenCalledTimes(1);
    expect(longPool.connect).not.toHaveBeenCalled();
  });

  it('sends the real long ones — 10s, 12s, 15s — to the long pool', async () => {
    await query('WITH mine AS MATERIALIZED (SELECT phone FROM "UserTags")', [1], 15_000);
    await query('SELECT ... FROM "UserTags" WHERE tag ILIKE $1', [1], 12_000);
    await query('SELECT ... FROM "UserConnection"', [1], 10_000);

    expect(longPool.connect).toHaveBeenCalledTimes(3);
    expect(shortPool.connect).not.toHaveBeenCalled();
  });

  it('leaves background jobs on their own pool, as they were', async () => {
    await backgroundQuery('SELECT 1 FROM "UserTags"');

    expect(backgroundPool.query).toHaveBeenCalledTimes(1);
    expect(shortPool.query).not.toHaveBeenCalled();
    expect(longPool.connect).not.toHaveBeenCalled();
  });
});

describe('what poolPressure reports', () => {
  it('reports the LONG pool — the one a search queues on', () => {
    longPool.totalCount = 10;
    longPool.idleCount = 0;
    longPool.waitingCount = 24;
    shortPool.totalCount = 3;
    shortPool.idleCount = 3;
    shortPool.waitingCount = 0;

    // These are the numbers the 18:46 burst actually produced. Reading the
    // short pool here would report a healthy 3/3idle/0waiting and say nothing
    // about the queue the searches were standing in.
    expect(poolPressure()).toEqual({ total: 10, idle: 0, waiting: 24 });
  });
});
