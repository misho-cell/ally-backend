const dbQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));
jest.mock('../contacts.service', () => ({ __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { createTestSeat } from '../testSeatCreate.service';

/**
 * A LOGIN GATE NOBODY HAS TESTED IS THE WORST THING TO RELEASE AT 62,163
 * PEOPLE, so the fiction to test it on comes first.
 *
 * The founder's rule, 24 September: an old Ally account cannot enter Netai by
 * logging in — it needs an invitation from somebody already here. Before any
 * of that is built, there has to be an account shaped like one of those 62,163
 * that is not one of those 62,163.
 *
 * An ordinary seat cannot stand in. It is deliberately a WORKING Netai user:
 * `hasAccessToAlly` true, tier pro, a year of subscription. That is the exact
 * opposite of the population the gate is for, so testing the gate on one would
 * prove the gate does not fire — which it would not, correctly, and would tell
 * us nothing.
 *
 * ⚠️ AND THE FLAG IS NOT THE DEFINITION. `hasAccessToAlly = false` matches
 * 62,163 accounts that have never opened Netai AND 35 who use it every day,
 * Lika Ose among them with 321 threads. It is the admin-login flag. The gate
 * keys on having NO NETAI ACTIVITY, which is why this seat's relevant property
 * is that it has no threads — the flag is set false only so the fiction
 * resembles the real thing in every column somebody might later read.
 */
beforeEach(() => {
  jest.clearAllMocks();
  dbQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes('RETURNING id'))
      return Promise.resolve({ rows: [{ id: 900001 }], rowCount: 1 });
    if (text.includes('FROM "UserPhone"')) return Promise.resolve({ rows: [], rowCount: 0 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
});

function userInsert(): { sql: string; params: unknown[] } | undefined {
  const call = dbQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO "User"'));
  return call ? { sql: String(call[0]), params: (call[1] ?? []) as unknown[] } : undefined;
}

describe('an ordinary seat is still a working Netai user', () => {
  it('is made with the flag true and a subscription, as before', async () => {
    await createTestSeat('Netai Test 99', [], 100, 'admin:1', 'an ordinary seat');

    const insert = userInsert();
    expect(insert).toBeDefined();
    // The shape argument defaults to {}, so legacyAlly is false.
    expect(insert?.params[1]).toBe(false);
  });

  /**
   * The subscription is the part that bit before: three seats were once made
   * with the status columns set and `current_period_ends_at` NULL, and every
   * one of them got 403 on its first chat. The gate reads the period end.
   */
  it('still sets the period end, which is the gate the product actually reads', async () => {
    await createTestSeat('Netai Test 99', [], 100, 'admin:1', 'an ordinary seat');

    expect(userInsert()?.sql).toContain("NOW() + INTERVAL '1 year'");
  });
});

describe('a legacy-Ally seat is the opposite on exactly the columns that matter', () => {
  it('is made with the flag false and no subscription', async () => {
    await createTestSeat('Netai Test 98', [], 100, 'admin:1', 'for the login gate', {
      legacyAlly: true,
    });

    expect(userInsert()?.params[1]).toBe(true);
  });

  /**
   * One INSERT, branching on the flag — not a second copy of the statement.
   * Two inserts that mean to agree about what a seat is are the next version
   * of every bug in this repository.
   */
  it('branches inside the one statement rather than duplicating it', async () => {
    const source = readFileSync(join(__dirname, '..', 'testSeatCreate.service.ts'), 'utf8');
    const inserts = source.split('INSERT INTO "User"').length - 1;

    expect(inserts).toBe(1);
    expect(source).toContain('CASE WHEN $2');
  });

  /** Everything else about a seat is unchanged — it is still fictional and still logged. */
  it('is still a seat: a fictional number and a test_seats row', async () => {
    await createTestSeat('Netai Test 98', [], 100, 'admin:1', 'for the login gate', {
      legacyAlly: true,
    });

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('INSERT INTO "UserPhone"');
    expect(sql).toContain('INSERT INTO test_seats');
  });

  it('refuses without a name or a reason, exactly as before', async () => {
    await expect(
      createTestSeat('  ', [], 100, 'admin:1', 'for the login gate', { legacyAlly: true }),
    ).rejects.toThrow(/name/);
    await expect(
      createTestSeat('Netai Test 98', [], 100, 'admin:1', 'x', { legacyAlly: true }),
    ).rejects.toThrow(/why/);
  });
});

describe('the route can ask for one', () => {
  it('accepts legacy_ally and defaults to the ordinary seat', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );

    expect(routes).toContain('legacy_ally');
    // `=== true` and not truthiness: a stray string must not silently make a
    // legacy seat when somebody meant an ordinary one.
    expect(routes).toContain('legacyAlly: legacy_ally === true');
  });
});

describe('⚠️ the shape is MEASURED, not reasoned — the first version could not be created', () => {
  beforeEach(async () => {
    await createTestSeat('Netai Test 40', [], 0, 'admin:1', 'legacy shape', {
      legacyAlly: true,
    });
  });

  /**
   * It set `subscription_tier` to NULL, on the perfectly sensible reasoning
   * that a legacy account has no subscription. **The column is NOT NULL**, so
   * every attempt died with a 500 — and it shipped with passing tests, because
   * the tests mock the database and a mock has no constraints.
   *
   * Built, deployed, and never once run. §34 said the login gate would be
   * proven on this seat before anybody turned it on; the gate went on at
   * 18:36:57 and the seat could not exist.
   *
   * The values now match what 62,156 real legacy accounts actually carry,
   * read from the live base: tier `free`, status `inactive`.
   */
  it('carries the tier the real population carries, and never NULL', () => {
    const insert = userInsert();

    expect(insert).toBeDefined();
    expect(insert?.sql).toContain("CASE WHEN $2 THEN 'free'");
    expect(insert?.sql).not.toMatch(/subscription_tier[\s\S]{0,80}THEN NULL/);
  });

  it('is inactive, like the 62,156', () => {
    expect(userInsert()?.sql).toContain("CASE WHEN $2 THEN 'inactive'");
  });

  /**
   * The one column that IS null for them, and the one the product's own
   * subscription gate actually reads: `hasActiveSubscription` asks the PERIOD
   * END, not the status.
   */
  it('has no subscription period, which is what the product checks', () => {
    expect(userInsert()?.sql).toMatch(/THEN NULL\s+ELSE NOW\(\) \+ INTERVAL '1 year'/);
  });
});
