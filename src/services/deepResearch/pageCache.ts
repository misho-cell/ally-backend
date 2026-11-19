import { query } from '../../db/postgres/client';
import { ProviderName, SourceHit } from './deepResearch.types';

/**
 * A page read in full is kept for a while, so the same public page — a
 * company's team page, an interview naming several people — is paid for once.
 * Public pages only: the research never reads a page behind a login.
 */
const CACHE_DAYS = 30;
const CACHE_QUERY_TIMEOUT_MS = 5_000;

export async function cachedPage(url: string): Promise<SourceHit | null> {
  const result = await query<{ title: string; text: string }>(
    `SELECT title, text FROM deep_research_pages
      WHERE url = $1 AND read_at > NOW() - make_interval(days => $2)
      LIMIT 1`,
    [url, CACHE_DAYS],
    CACHE_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row ? { url, title: row.title, text: row.text, provider: ProviderName.Firecrawl } : null;
}

export async function keepPage(page: SourceHit): Promise<void> {
  await query(
    `INSERT INTO deep_research_pages (url, title, text, read_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, text = EXCLUDED.text, read_at = NOW()`,
    [page.url, page.title, page.text],
    CACHE_QUERY_TIMEOUT_MS,
  );
}
