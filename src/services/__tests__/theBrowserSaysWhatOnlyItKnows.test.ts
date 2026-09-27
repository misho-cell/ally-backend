jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import {
  recordNotificationState,
  notificationStateCounts,
  isNotificationState,
  NOTIFICATION_STATES,
} from '../notificationState.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const rows = (data: unknown[]): { rows: unknown[]; rowCount: number } => ({
  rows: data,
  rowCount: data.length,
});

beforeEach(() => jest.clearAllMocks());

/**
 * ROW 276 — „this account has no push subscription" is one row in the database
 * and four different situations in the world: nobody asked, they said no, the
 * phone cannot do it at all, or they said yes and our registration failed.
 *
 * Two of those are ours to fix, one is a decision to respect, one is not a
 * fault. Until this table they looked identical from the server, and on 26
 * September that cost an evening: finding out why a phone got no notification
 * meant reading subscription rows by hand.
 */
describe('the five words, and nothing else', () => {
  it('accepts exactly the five the front end proposed', () => {
    expect([...NOTIFICATION_STATES]).toEqual([
      'unasked',
      'denied',
      'granted',
      'needs_pwa',
      'unsupported',
    ]);
  });

  /**
   * ⚠️ AN UNKNOWN WORD IS REFUSED, NOT STORED. A column that takes whatever
   * the client sends stops being an answer and becomes a second question —
   * and this table exists to end a question.
   */
  it('refuses anything else, including the near misses', () => {
    for (const word of ['blocked', 'DENIED', 'granted ', '', 'true', 'default']) {
      expect(isNotificationState(word)).toBe(false);
    }
    for (const word of NOTIFICATION_STATES) expect(isNotificationState(word)).toBe(true);
  });
});

describe('what a report writes', () => {
  const stored = [{ state: 'denied', standalone: true, state_since: '2026-09-27T06:00:00.000Z' }];

  /**
   * ⚠️ `state_since` MOVES ONLY WHEN THE STATE CHANGES, and the reason is the
   * reporting rhythm: the front end reports on every app open. Without this,
   * somebody who denied once and opens the app daily reads as having denied
   * today — every day, forever. „Denied this morning" and „denied for a
   * fortnight" call for opposite responses from us.
   */
  it('keeps the date the current state began, and moves it when it changes', async () => {
    mockQuery.mockResolvedValue(rows(stored) as never);

    await recordNotificationState('501', 'denied', true);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(sql).toContain('WHEN notification_state.state = EXCLUDED.state');
    expect(sql).toContain('THEN notification_state.state_since');
    expect(sql).toContain('ELSE NOW()');
    // And the other half: we always record that we heard something.
    expect(sql).toContain('updated_at  = NOW()');
    expect(params).toEqual(['501', 'denied', true]);
  });

  /** A browser that did not say is not a browser that said no. */
  it('stores an absent standalone as null rather than false', async () => {
    mockQuery.mockResolvedValue(rows(stored) as never);

    await recordNotificationState('501', 'granted', null);

    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1][2]).toBeNull();
  });

  it('fails loudly if nothing came back, instead of returning a shape it invented', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await expect(recordNotificationState('501', 'granted', true)).rejects.toThrow(
      'notification state was not stored',
    );
  });
});

/**
 * The counts exist to be PAIRED with the subscriptions. `granted` with no
 * subscription is the worst square in the table — the person said yes and we
 * lost it — and it cannot be seen from either number alone.
 */
describe('the reading half', () => {
  it('counts each state beside how many of them actually have a subscription', async () => {
    mockQuery.mockResolvedValue(
      rows([{ state: 'granted', accounts: '7', with_a_subscription: '5' }]) as never,
    );

    const counts = await notificationStateCounts();

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('FROM push_subscriptions p WHERE p.user_id = n.user_id');
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/);
    expect(counts).toEqual([{ state: 'granted', accounts: 7, with_a_subscription: 5 }]);
  });
});

describe('where the route sits, which is load-bearing', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'notifications.routes.ts'),
    'utf8',
  );

  /**
   * ⚠️ OUTSIDE THE PAYMENT GATE, ON PURPOSE. Express applies middleware in the
   * order it is added, so registering this route above `requireSubscription`
   * keeps it outside while everything below stays inside.
   *
   * A lapsed account is exactly the account whose silence most needs
   * explaining, and a 402 would throw away the report rather than the person.
   */
  it('is registered before the subscription gate', () => {
    const state = route.indexOf("notificationsRouter.post(\n  '/state'");
    const gate = route.indexOf('notificationsRouter.use(requireSubscription)');

    expect(state).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(state).toBeLessThan(gate);
  });

  it('refuses an unknown word with a 400 that names the five', () => {
    expect(route).toContain('if (!isNotificationState(state))');
    expect(route).toContain('NOTIFICATION_STATES.join');
  });

  /** The front end asked for user_agent to be left out, and they were right. */
  it('does not ask for a user agent', () => {
    const block = route.slice(
      route.indexOf("notificationsRouter.post(\n  '/state'"),
      route.indexOf('notificationsRouter.use(requireSubscription)'),
    );
    expect(block).not.toContain('user_agent');
  });
});
