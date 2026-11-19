import { query } from '../../db/postgres/client';
import { getPrice, recordFixedUsage } from '../costLedger.service';
import { ProviderName } from './deepResearch.types';
import { READER_USAGE_KIND } from './researchReader';

/**
 * What the research spends, from the usage ledger itself: every search, page
 * read and model call is booked there under the person's run id, so the
 * ceiling is checked against what was really booked, not a running guess.
 *
 * Two limits, both the admin's: a ceiling per person (the request's max_usd,
 * never above MAX_USD_PER_PERSON) and a daily ceiling for all research
 * together (DEEP_RESEARCH_DAILY_USD, set in Railway without a deploy).
 */
export const SEARCH_USAGE_KIND = 'deep_research_search';
export const DEFAULT_USD_PER_PERSON = 0.5;
export const MAX_USD_PER_PERSON = 2;
const DEFAULT_DAILY_USD = 25;
/** What one model reading of a step is reserved at before it runs: its real cost is booked after. */
export const READ_RESERVE_USD = 0.1;
const SPEND_QUERY_TIMEOUT_MS = 5_000;
const KINDS = [SEARCH_USAGE_KIND, READER_USAGE_KIND];

export function dailyLimitUsd(): number {
  const raw = Number(process.env.DEEP_RESEARCH_DAILY_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DAILY_USD;
}

export async function spentOnRun(runId: string): Promise<number> {
  const result = await query<{ usd: string | null }>(
    'SELECT SUM(cost_usd) AS usd FROM usage_events WHERE run_id = $1 AND kind = ANY($2::text[])',
    [runId, KINDS],
    SPEND_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.usd ?? 0);
}

export async function spentToday(): Promise<number> {
  const result = await query<{ usd: string | null }>(
    `SELECT SUM(cost_usd) AS usd FROM usage_events
      WHERE kind = ANY($1::text[]) AND created_at >= date_trunc('day', NOW())`,
    [KINDS],
    SPEND_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.usd ?? 0);
}

/** The price of each call, summed: what a step costs before its reading. */
export async function priceOf(priceKeys: readonly string[]): Promise<number> {
  const prices = await Promise.all(priceKeys.map((key) => getPrice(key)));
  return prices.reduce((sum, price) => sum + price, 0);
}

/** Books one search or page read on the run. */
export async function chargeCall(
  runId: string,
  provider: ProviderName,
  priceKey: string,
): Promise<void> {
  await recordFixedUsage({ userId: null, kind: SEARCH_USAGE_KIND, provider, priceKey, runId });
}
