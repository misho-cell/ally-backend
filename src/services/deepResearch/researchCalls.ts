import { ProviderName, SourceHit } from './deepResearch.types';
import { cachedPage, keepPage } from './pageCache';
import { ENGINE_CALL, PlannedSearch } from './researchQueries';
import { chargeCall } from './researchSpend';
import { exaSearch, firecrawlRead, linkupSearch } from './searchProviders';

/**
 * The paid calls of one step, run side by side. A call that fails is logged
 * with its service and status and left out — one service down does not stop
 * the person's research — and only a call that answered is booked.
 */

/** What a page read costs, for the step's budget check. */
export const PAGE_PRICE_KEY = 'firecrawl.scrape';

function logFailure(what: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[deep-research] ${what} failed:`, (err as Error).message);
}

async function oneSearch(runId: string, planned: PlannedSearch): Promise<SourceHit[]> {
  const call = ENGINE_CALL[planned.engine];
  try {
    const hits =
      call.provider === ProviderName.Exa
        ? await exaSearch(planned.query, call.category)
        : await linkupSearch(planned.query, call.depth);
    await chargeCall(runId, call.provider, call.priceKey);
    return hits;
  } catch (err) {
    logFailure(planned.engine, err);
    return [];
  }
}

export async function runSearches(
  runId: string,
  searches: readonly PlannedSearch[],
): Promise<SourceHit[]> {
  const results = await Promise.all(searches.map((s) => oneSearch(runId, s)));
  return results.flat();
}

async function onePage(runId: string, url: string): Promise<SourceHit | null> {
  try {
    const cached = await cachedPage(url);
    if (cached !== null) return cached;
    const page = await firecrawlRead(url);
    await chargeCall(runId, ProviderName.Firecrawl, PAGE_PRICE_KEY);
    if (page !== null) await keepPage(page);
    return page;
  } catch (err) {
    logFailure('page read', err);
    return null;
  }
}

/** Each page read in full, from the cache when it was read in the last month. */
export async function readFullPages(runId: string, urls: readonly string[]): Promise<SourceHit[]> {
  const pages = await Promise.all(urls.map((url) => onePage(runId, url)));
  return pages.filter((page): page is SourceHit => page !== null);
}
