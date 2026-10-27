import { query } from '../../db/postgres/client';
import { geminiModel } from './geminiSearch';

/**
 * #7690 (founder, 25 Oct: „I prefer to have gemini engine for web research").
 * Which engine answers a web search. Gemini with Google Search grounding when
 * its key is in the environment AND the switch is on; Tavily otherwise, and
 * Tavily stays the fallback until the tester passes the ten questions.
 *
 * The switch is the app flag below (or GEMINI_WEB_SEARCH_ON=true in Railway),
 * so it can be turned off in seconds without a deploy.
 */
export enum WebSearchProvider {
  Gemini = 'gemini',
  Tavily = 'tavily',
}

export const GEMINI_WEB_SEARCH_FLAG = 'gemini_web_search';
const FLAG_TTL_MS = 30_000;
const FLAG_QUERY_TIMEOUT_MS = 3_000;

/** What one search costs in the usage ledger, per engine (provider_prices, migration 277). */
const LEDGER: Readonly<Record<WebSearchProvider, { provider: string; priceKey: string }>> = {
  [WebSearchProvider.Gemini]: { provider: 'gemini', priceKey: 'gemini.search' },
  [WebSearchProvider.Tavily]: { provider: 'tavily', priceKey: 'tavily.search' },
};

/** A page read when Gemini searches: our own plain fetch, which costs nothing. */
const DIRECT_FETCH_LEDGER = { provider: 'direct', priceKey: 'direct.page_fetch' } as const;

let flagRead: { readonly on: boolean; readonly at: number } | null = null;

export function geminiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() ?? '';
}

export function tavilyKey(): string {
  return process.env.TAVILY_API_KEY?.trim() ?? '';
}

async function switchOn(): Promise<boolean> {
  if (process.env.GEMINI_WEB_SEARCH_ON?.trim() === 'true') return true;
  const now = Date.now();
  if (flagRead !== null && now - flagRead.at < FLAG_TTL_MS) return flagRead.on;
  try {
    const result = await query<{ enabled: boolean }>(
      'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
      [GEMINI_WEB_SEARCH_FLAG],
      FLAG_QUERY_TIMEOUT_MS,
    );
    flagRead = { on: result.rows[0]?.enabled === true, at: now };
    return flagRead.on;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[web-search] gemini switch not read:', (err as Error).message);
    return false;
  }
}

/** The engine for this search. Without a Gemini key the switch is never even read. */
export async function webSearchProvider(): Promise<WebSearchProvider> {
  if (geminiKey() === '') return WebSearchProvider.Tavily;
  return (await switchOn()) ? WebSearchProvider.Gemini : WebSearchProvider.Tavily;
}

/**
 * Ledger fields for one web search. A Gemini call that fell back to Tavily is
 * still booked as Gemini, with the model it ran on (tester 76826).
 */
export async function webSearchLedger(): Promise<{
  provider: string;
  priceKey: string;
  label?: string;
}> {
  const provider = await webSearchProvider();
  return provider === WebSearchProvider.Gemini
    ? { ...LEDGER[provider], label: geminiModel() }
    : LEDGER[provider];
}

/** Ledger fields for one page read (fetch_page). */
export async function pageFetchLedger(): Promise<{ provider: string; priceKey: string }> {
  return (await webSearchProvider()) === WebSearchProvider.Gemini
    ? DIRECT_FETCH_LEDGER
    : LEDGER[WebSearchProvider.Tavily];
}

/** Tests only: forget the cached switch. */
export function resetWebSearchSwitchForTests(): void {
  flagRead = null;
}
