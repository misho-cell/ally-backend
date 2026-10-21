import { query } from '../db/postgres/client';
import { clearPriceCache } from './costLedger.service';

/**
 * The tokens a free trial carries (Misho, 21 Oct: „ადმინში ღილაკი"). The
 * number lives in provider_prices and the wallet reads it lazily, once per
 * trial, when the member first needs a balance — so a new value reaches every
 * trial not yet credited, and a trial already credited keeps what it got.
 */
export const TRIAL_GRANT_PRICE_KEY = 'tokens.trial_grant';

/**
 * A TYPO GUARD, not a policy: 2,000 was the founder's number on launch day,
 * and a dashboard should not hand out a hundred times that because a finger
 * slipped. The route refuses above it rather than clamping.
 */
export const MAX_TRIAL_GRANT = 20_000;

const TRIAL_GRANT_QUERY_TIMEOUT_MS = 8_000;

export interface TrialGrant {
  readonly value: number;
  readonly updated_at: string | null;
}

export async function readTrialGrant(): Promise<TrialGrant> {
  const result = await query<{ value: string; updated_at: string }>(
    'SELECT value::text AS value, updated_at FROM provider_prices WHERE price_key = $1',
    [TRIAL_GRANT_PRICE_KEY],
    TRIAL_GRANT_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined
    ? { value: 0, updated_at: null }
    : { value: Number(row.value), updated_at: row.updated_at };
}

/** Writes the number and drops the price cache, so this process credits it at once. */
export async function writeTrialGrant(value: number): Promise<TrialGrant> {
  const result = await query<{ value: string; updated_at: string }>(
    `INSERT INTO provider_prices (price_key, value) VALUES ($1, $2)
     ON CONFLICT (price_key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING value::text AS value, updated_at`,
    [TRIAL_GRANT_PRICE_KEY, value],
    TRIAL_GRANT_QUERY_TIMEOUT_MS,
  );
  clearPriceCache();
  const row = result.rows[0];
  return { value: Number(row?.value ?? value), updated_at: row?.updated_at ?? null };
}
