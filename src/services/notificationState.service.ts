import { query } from '../db/postgres/client';

/**
 * ROW 276 — the browser reports what only the browser knows.
 *
 * ⚠️ WHAT THIS EXISTS TO SEPARATE. „No push subscription" is one row in the
 * database and four different situations in the world: nobody asked, they said
 * no, the phone cannot do it at all, or they said yes and the registration
 * failed. Two of those are ours to fix, one is a decision to respect, and one
 * is not a fault. Until now they looked the same from here.
 */
const STATE_TIMEOUT_MS = 5_000;

/**
 * The five words, and no others.
 *
 * ⚠️ AN UNKNOWN WORD IS REFUSED RATHER THAN STORED. A column that accepts
 * anything the client sends stops being an answer and becomes a second
 * question — and this table exists precisely to end a question.
 */
export const NOTIFICATION_STATES = [
  /** Could have been asked and was not — the front end's own bug to fix. */
  'unasked',
  /** They said no. Respect it; the answer is instructions, never code. */
  'denied',
  /** They said yes. With no subscription row beside it, OUR registration failed. */
  'granted',
  /** iPhone in a Safari tab: push is physically impossible until it is installed. */
  'needs_pwa',
  /** The browser has no push at all. Not a fault of anybody's. */
  'unsupported',
] as const;

export type NotificationState = (typeof NOTIFICATION_STATES)[number];

export function isNotificationState(value: unknown): value is NotificationState {
  return typeof value === 'string' && (NOTIFICATION_STATES as readonly string[]).includes(value);
}

export interface StoredNotificationState {
  readonly state: NotificationState;
  readonly standalone: boolean | null;
  readonly state_since: string;
}

/**
 * Record what the browser says, keeping the date the CURRENT state began.
 *
 * ⚠️ `state_since` MOVES ONLY WHEN THE STATE ITSELF CHANGES. The front end
 * reports on every app open, so a person who denied once and opens the app
 * daily would otherwise read as having denied today, every day, forever — and
 * „denied this morning" and „denied for a fortnight" call for opposite
 * responses from us. `updated_at` carries the other half: when we last heard
 * anything at all.
 */
export async function recordNotificationState(
  userId: string,
  state: NotificationState,
  standalone: boolean | null,
): Promise<StoredNotificationState> {
  const result = await query<StoredNotificationState>(
    `INSERT INTO notification_state (user_id, state, standalone)
     VALUES ($1::int, $2::text, $3::boolean)
     ON CONFLICT (user_id) DO UPDATE
        SET state       = EXCLUDED.state,
            standalone  = EXCLUDED.standalone,
            updated_at  = NOW(),
            state_since = CASE
                            WHEN notification_state.state = EXCLUDED.state
                            THEN notification_state.state_since
                            ELSE NOW()
                          END
     RETURNING state, standalone, state_since`,
    [userId, state, standalone],
    STATE_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('notification state was not stored');
  return row;
}

export interface NotificationStateCount {
  readonly state: string;
  readonly accounts: number;
  readonly with_a_subscription: number;
}

/**
 * The counts, and beside each one how many of those accounts actually have a
 * subscription — because that pairing is the whole point.
 *
 * `granted` with no subscription is the worst square in the table: the person
 * said yes and we lost it. `denied` with a subscription is a stale row we
 * should stop sending to. Neither could be seen before this table existed.
 */
export async function notificationStateCounts(): Promise<NotificationStateCount[]> {
  const result = await query<{ state: string; accounts: string; with_a_subscription: string }>(
    `SELECT n.state,
            COUNT(*) AS accounts,
            COUNT(*) FILTER (
              WHERE EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = n.user_id)
            ) AS with_a_subscription
       FROM notification_state n
      GROUP BY n.state
      ORDER BY n.state`,
    [],
    STATE_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    state: r.state,
    accounts: Number(r.accounts),
    with_a_subscription: Number(r.with_a_subscription),
  }));
}
