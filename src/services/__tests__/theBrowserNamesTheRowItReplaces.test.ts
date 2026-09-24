const dbQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));

import { savePushSubscription } from '../notification.service';

/**
 * ROW 101 — THE ONLY PARTY THAT KNOWS WHICH ROW WAS REPLACED IS THE BROWSER.
 *
 * A notification goes to EVERY row in `push_subscriptions` for a person, and a
 * row is only ever removed when the push service answers 404 or 410. For these
 * rows Apple and Google never have. So when an endpoint rotates — a reinstall,
 * a browser update, a permission reset — the new row appears BESIDE the old
 * one and the person hears the same thing twice. Account 160584 reached five
 * live endpoints for two real devices.
 *
 * I tried to solve it on the server and proved I could not: the rule „retire
 * the older row carrying the same device_id" matches nothing in the table,
 * because every row that duplicates today predates the device_id field itself.
 * The frontend now sends `previous_endpoint` on the registration that replaces
 * one.
 *
 * WHICH MAKES THIS A DELETE DRIVEN BY CLIENT INPUT, so the guards matter more
 * than the feature. Each test below is a way this could silence somebody's
 * phone instead of quietening a duplicate.
 */
const NEW_ENDPOINT = 'https://web.push.apple.com/NEW';
const OLD_ENDPOINT = 'https://web.push.apple.com/OLD';

function payload(over: Record<string, unknown> = {}): never {
  return {
    endpoint: NEW_ENDPOINT,
    keys: { p256dh: 'p', auth: 'a' },
    ...over,
  } as never;
}

function deleteCalls(): { sql: string; params: unknown[] }[] {
  return dbQuery.mock.calls
    .map((c) => ({ sql: String(c[0]), params: (c[1] ?? []) as unknown[] }))
    .filter((c) => c.sql.includes('DELETE FROM push_subscriptions'));
}

beforeEach(() => {
  jest.clearAllMocks();
  dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('it retires the endpoint the browser named', () => {
  it('deletes exactly that one', async () => {
    await savePushSubscription('501', payload({ previous_endpoint: OLD_ENDPOINT }));

    const deletes = deleteCalls();
    expect(deletes).toHaveLength(1);
    expect(deletes[0].params).toEqual(['501', OLD_ENDPOINT]);
  });

  /**
   * SCOPED TO THE CALLER, AND THIS IS THE ONE THAT MATTERS MOST. Endpoints are
   * globally unique, so without `user_id` in the WHERE clause anyone could
   * post somebody else's endpoint and stop their notifications. With it, this
   * is exactly the capability DELETE /notifications/subscribe already gives —
   * a person removing their own device — and needs no new permission.
   */
  it('cannot reach another person’s subscription', async () => {
    await savePushSubscription('501', payload({ previous_endpoint: OLD_ENDPOINT }));

    const [del] = deleteCalls();
    expect(del.sql).toContain('user_id = $1');
    expect(del.sql).toContain('endpoint = $2');
  });

  /** The insert first: if it fails, nothing has been retired and the phone still rings. */
  it('writes the new subscription before retiring the old one', async () => {
    await savePushSubscription('501', payload({ previous_endpoint: OLD_ENDPOINT }));

    const order = dbQuery.mock.calls.map((c) => String(c[0]));
    const inserted = order.findIndex((s) => s.includes('INSERT INTO push_subscriptions'));
    const deleted = order.findIndex((s) => s.includes('DELETE FROM push_subscriptions'));

    expect(inserted).toBeGreaterThan(-1);
    expect(deleted).toBeGreaterThan(inserted);
  });
});

describe('what it refuses to delete', () => {
  /**
   * THE WORST CASE THIS CODE COULD PRODUCE. The client omits the field when the
   * endpoint has not changed — and the server does not take its word for it.
   * Deleting the row just written leaves the person with NO subscription at
   * all, which is worse than the duplicate this exists to remove.
   */
  it('never deletes the row it has just written', async () => {
    await savePushSubscription('501', payload({ previous_endpoint: NEW_ENDPOINT }));

    expect(deleteCalls()).toHaveLength(0);
  });

  it('ignores whitespace around an otherwise identical endpoint', async () => {
    await savePushSubscription('501', payload({ previous_endpoint: `  ${NEW_ENDPOINT}  ` }));

    expect(deleteCalls()).toHaveLength(0);
  });

  it('does nothing when the field is absent', async () => {
    await savePushSubscription('501', payload());

    expect(deleteCalls()).toHaveLength(0);
  });

  it('does nothing when the field is blank', async () => {
    await savePushSubscription('501', payload({ previous_endpoint: '   ' }));

    expect(deleteCalls()).toHaveLength(0);
  });
});

/**
 * D149. An endpoint plus its keys is a capability to push to somebody's phone.
 * A log line is not where that belongs, and this one runs on every device that
 * ever re-registers.
 */
describe('it does not write a capability into the log', () => {
  it('logs that a row was retired without naming it', async () => {
    const logged: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logged.push(a.map(String).join(' '));
    });

    await savePushSubscription('501', payload({ previous_endpoint: OLD_ENDPOINT }));
    spy.mockRestore();

    const pushLines = logged.filter((l) => l.includes('[push]'));
    expect(pushLines.length).toBeGreaterThan(0);
    for (const line of pushLines) {
      expect(line).not.toContain(OLD_ENDPOINT);
      expect(line).not.toContain(NEW_ENDPOINT);
    }
  });
});
