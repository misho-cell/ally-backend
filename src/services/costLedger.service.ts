import { query } from '../db/postgres/client';

// Prices change rarely; cache lookups briefly so the ledger adds no
// meaningful DB load to hot paths like the chat loop.
const PRICE_CACHE_TTL_MS = 60_000;
const TOKENS_PER_MTOK = 1_000_000;
const COST_DECIMALS = 6;

interface CachedPrice {
  value: number;
  fetchedAt: number;
}

const priceCache = new Map<string, CachedPrice>();

export async function getPrice(priceKey: string): Promise<number> {
  const cached = priceCache.get(priceKey);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.value;
  }

  const result = await query<{ value: string }>(
    'SELECT value FROM provider_prices WHERE price_key = $1',
    [priceKey],
  );

  const value = result.rows[0] ? Number(result.rows[0].value) : 0;
  if (!result.rows[0]) {
    // eslint-disable-next-line no-console
    console.warn(`[cost-ledger] missing price for "${priceKey}" — recording cost 0`);
  }
  priceCache.set(priceKey, { value, fetchedAt: Date.now() });
  return value;
}

// Tests and admin price updates shouldn't wait out the TTL.
export function clearPriceCache(): void {
  priceCache.clear();
}

function round(cost: number): number {
  return Number(cost.toFixed(COST_DECIMALS));
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface ClaudeUsageEvent {
  userId: string | null;
  kind: string;
  model: string;
  usage: ClaudeUsage;
  runId?: string;
  threadId?: number;
}

/**
 * Record one Anthropic API call. Cost = exact billed token counts from the
 * response × current per-MTok rates. Callers invoke fire-and-forget — the
 * ledger must never break or slow the user-facing path.
 */
export async function recordClaudeUsage(event: ClaudeUsageEvent): Promise<void> {
  const [inRate, outRate, cacheWriteRate, cacheReadRate] = await Promise.all([
    getPrice(`anthropic.${event.model}.input_mtok`),
    getPrice(`anthropic.${event.model}.output_mtok`),
    getPrice(`anthropic.${event.model}.cache_write_mtok`),
    getPrice(`anthropic.${event.model}.cache_read_mtok`),
  ]);

  const input = event.usage.input_tokens ?? 0;
  const output = event.usage.output_tokens ?? 0;
  const cacheWrite = event.usage.cache_creation_input_tokens ?? 0;
  const cacheRead = event.usage.cache_read_input_tokens ?? 0;

  const cost = round(
    (input * inRate + output * outRate + cacheWrite * cacheWriteRate + cacheRead * cacheReadRate) /
      TOKENS_PER_MTOK,
  );

  await query(
    `INSERT INTO usage_events
       (user_id, kind, provider, model, input_tokens, output_tokens,
        cache_creation_tokens, cache_read_tokens, cost_usd, run_id, thread_id)
     VALUES ($1, $2, 'anthropic', $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.userId,
      event.kind,
      event.model,
      input,
      output,
      cacheWrite,
      cacheRead,
      cost,
      event.runId ?? null,
      event.threadId ?? null,
    ],
  );
}

export interface FixedUsageEvent {
  userId: string | null;
  kind: string;
  provider: string;
  priceKey: string;
  units?: number;
  runId?: string;
}

/** Record a fixed-price spend (Tavily search, OTP message, SMS). */
export async function recordFixedUsage(event: FixedUsageEvent): Promise<void> {
  const units = event.units ?? 1;
  const rate = await getPrice(event.priceKey);
  const cost = round(units * rate);

  await query(
    `INSERT INTO usage_events (user_id, kind, provider, units, cost_usd, run_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.userId, event.kind, event.provider, units, cost, event.runId ?? null],
  );
}

/**
 * Resolve a phone number to a registered user id for attribution of
 * pre-auth spend (OTP messages). Returns null for unknown phones.
 */
export async function resolveUserIdByPhone(phone: string): Promise<string | null> {
  const result = await query<{ userId: number }>(
    'SELECT "userId" FROM "UserPhone" WHERE phone = $1 LIMIT 1',
    [phone],
  );
  return result.rows[0] ? String(result.rows[0].userId) : null;
}
