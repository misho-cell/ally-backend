import { query } from '../db/postgres/client';

/**
 * The frontend's 06:30Z item 8 (onboarding B8): has this person's Claude
 * connector logged in, and when was it last seen?
 *
 * Read from the OAuth grants the connector holds (oauth_tokens). Connected
 * means a grant that can still be refreshed and was not revoked. „Last seen"
 * is the newest grant: one is issued at login and again at every refresh, and
 * an access token lives one hour — so a connector in use is seen at least
 * hourly, and one left alone stops moving. No token is read or returned.
 */
const QUERY_TIMEOUT_MS = 5_000;

export interface ConnectorState {
  readonly connected: boolean;
  readonly last_seen_at: string | null;
}

export async function connectorState(userId: number): Promise<ConnectorState> {
  const result = await query<{ connected: boolean | null; last_seen_at: string | null }>(
    `SELECT BOOL_OR(revoked_at IS NULL AND refresh_expires_at > NOW()) AS connected,
            MAX(created_at) AS last_seen_at
       FROM oauth_tokens
      WHERE user_id = $1`,
    [String(userId)],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return { connected: row?.connected === true, last_seen_at: row?.last_seen_at ?? null };
}
