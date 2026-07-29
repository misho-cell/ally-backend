import { query } from '../db/postgres/client';

const EVENT_QUERY_TIMEOUT_MS = 3_000;

/**
 * Append one product analytics event (e.g. request_resolved {action, source}).
 * Best-effort: analytics must never fail or slow the flow that emits it —
 * callers may fire-and-forget.
 */
export async function recordProductEvent(
  userId: string | number | null,
  event: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    await query(
      `INSERT INTO product_events (user_id, event, props) VALUES ($1, $2, $3)`,
      [userId, event, JSON.stringify(props)],
      EVENT_QUERY_TIMEOUT_MS,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[events] failed to record ${event}:`, (err as Error).message);
  }
}
