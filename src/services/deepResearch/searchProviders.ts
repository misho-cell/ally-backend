import { ProviderName, SourceHit } from './deepResearch.types';
import { arrayField, postJson, providerKey, stringField } from './providerHttp';

/**
 * The three services the brief names, each as one call that returns pages in
 * one shape (url, title, text). Keys come from the environment only:
 * EXA_API_KEY, LINKUP_API_KEY, FIRECRAWL_API_KEY.
 */
export const EXA_KEY_ENV = 'EXA_API_KEY';
export const LINKUP_KEY_ENV = 'LINKUP_API_KEY';
export const FIRECRAWL_KEY_ENV = 'FIRECRAWL_API_KEY';

const EXA_URL = 'https://api.exa.ai/search';
const LINKUP_URL = 'https://api.linkup.so/v1/search';
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';

const EXA_TIMEOUT_MS = 30_000;
const LINKUP_STANDARD_TIMEOUT_MS = 45_000;
const LINKUP_DEEP_TIMEOUT_MS = 120_000;
const FIRECRAWL_TIMEOUT_MS = 45_000;
/** Firecrawl's own limit on the page load, under our timeout so its answer still arrives. */
const FIRECRAWL_PAGE_TIMEOUT_MS = 40_000;

const EXA_RESULTS = 10;
const LINKUP_RESULTS = 10;
/** What is kept of a search result's text: enough to tell whose page it is. */
export const SEARCH_TEXT_CHARS = 1_500;
/** What is kept of a page read in full. */
export const PAGE_TEXT_CHARS = 12_000;

/** Exa's own index of people pages, or the open web. */
export enum ExaCategory {
  People = 'people',
  Web = 'web',
}

export enum LinkupDepth {
  Standard = 'standard',
  Deep = 'deep',
}

/** Whether every key the research needs is set. */
export function providerKeysSet(): boolean {
  return [EXA_KEY_ENV, LINKUP_KEY_ENV, FIRECRAWL_KEY_ENV].every((name) => providerKey(name) !== '');
}

function hit(provider: ProviderName, url: string, title: string, text: string): SourceHit {
  return { provider, url, title, text: text.slice(0, SEARCH_TEXT_CHARS) };
}

/** Pure: Exa's answer as pages. */
export function exaHits(data: unknown): SourceHit[] {
  return arrayField(data, 'results')
    .map((row) =>
      hit(
        ProviderName.Exa,
        stringField(row, 'url'),
        stringField(row, 'title'),
        stringField(row, 'text'),
      ),
    )
    .filter((h) => h.url !== '');
}

export async function exaSearch(query: string, category: ExaCategory): Promise<SourceHit[]> {
  const body = {
    query,
    type: 'auto',
    numResults: EXA_RESULTS,
    contents: { text: { maxCharacters: SEARCH_TEXT_CHARS } },
    ...(category === ExaCategory.People ? { category } : {}),
  };
  const data = await postJson(
    ProviderName.Exa,
    EXA_URL,
    { 'x-api-key': providerKey(EXA_KEY_ENV) },
    body,
    EXA_TIMEOUT_MS,
  );
  return exaHits(data);
}

/** Pure: Linkup's answer as pages; image results are left out. */
export function linkupHits(data: unknown): SourceHit[] {
  return arrayField(data, 'results')
    .filter((row) => stringField(row, 'type') !== 'image')
    .map((row) =>
      hit(
        ProviderName.Linkup,
        stringField(row, 'url'),
        stringField(row, 'name'),
        stringField(row, 'content'),
      ),
    )
    .filter((h) => h.url !== '');
}

export async function linkupSearch(query: string, depth: LinkupDepth): Promise<SourceHit[]> {
  const data = await postJson(
    ProviderName.Linkup,
    LINKUP_URL,
    { Authorization: `Bearer ${providerKey(LINKUP_KEY_ENV)}` },
    { q: query, depth, outputType: 'searchResults', maxResults: LINKUP_RESULTS },
    depth === LinkupDepth.Deep ? LINKUP_DEEP_TIMEOUT_MS : LINKUP_STANDARD_TIMEOUT_MS,
  );
  return linkupHits(data);
}

/** Pure: Firecrawl's answer as one page, or null when it read nothing. */
export function firecrawlPage(data: unknown, url: string): SourceHit | null {
  const page = (data as { data?: unknown } | null)?.data;
  const markdown = stringField(page, 'markdown').trim();
  if (markdown === '') return null;
  const metadata = (page as { metadata?: unknown }).metadata;
  return {
    provider: ProviderName.Firecrawl,
    url,
    title: stringField(metadata, 'title'),
    text: markdown.slice(0, PAGE_TEXT_CHARS),
  };
}

export async function firecrawlRead(url: string): Promise<SourceHit | null> {
  const data = await postJson(
    ProviderName.Firecrawl,
    FIRECRAWL_URL,
    { Authorization: `Bearer ${providerKey(FIRECRAWL_KEY_ENV)}` },
    {
      url,
      formats: [{ type: 'markdown' }],
      onlyMainContent: true,
      timeout: FIRECRAWL_PAGE_TIMEOUT_MS,
    },
    FIRECRAWL_TIMEOUT_MS,
  );
  return firecrawlPage(data, url);
}
