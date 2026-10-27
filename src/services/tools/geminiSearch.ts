/**
 * #7690 — one web search through Gemini with Grounding with Google Search.
 *
 * The rest of the product reads search results as (title, url, snippet), the
 * shape Tavily gave. Gemini answers with its own text plus grounding metadata:
 * the web pages it used (`groundingChunks`) and which sentence of its answer
 * each page supports (`groundingSupports`). One result per page is rebuilt
 * from that: its title, its real address, and the supported sentences as the
 * snippet. Gemini's own summary is never passed on as a result, for the same
 * reason Tavily's `answer` is not (webSearch.ts, the officeholder rule).
 *
 * Grounded page addresses come back as Google redirect links; each is followed
 * once, without reading the page, so the model is handed the page's own
 * address (fetch_page and „name it with its full link" both need it).
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// 27 Oct: a key made after 18 Sep gets 404 on gemini-2.5-flash ("no longer
// available to new users"); the error itself names this one.
const DEFAULT_MODEL = 'gemini-3.8-flash';
const SEARCH_TIMEOUT_MS = 20_000;
const REDIRECT_TIMEOUT_MS = 4_000;
const MAX_RESULTS = 5;
const SNIPPET_CHARS = 600;
const REDIRECT_HOST = 'vertexaisearch.cloud.google.com';

const SEARCH_INSTRUCTION =
  'Search the web for the query below. Report what the sources say, one short paragraph per ' +
  'source, keeping every name, job title, organisation and date exactly as the source writes ' +
  'it. Do not add anything the sources do not say.\n\nQuery: ';

export interface GeminiHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GroundingSupport {
  segment?: { text?: string };
  groundingChunkIndices?: number[];
}

export interface GeminiResponse {
  candidates?: {
    groundingMetadata?: {
      groundingChunks?: GroundingChunk[];
      groundingSupports?: GroundingSupport[];
    };
  }[];
}

export class GeminiSearchError extends Error {}

/** The Gemini model a search runs on; also booked on its usage row. */
export function geminiModel(): string {
  return process.env.GEMINI_SEARCH_MODEL?.trim() || DEFAULT_MODEL;
}

/** Pure: the pages a grounded answer used, each with the sentences it supports. */
export function groundedHits(data: GeminiResponse): GeminiHit[] {
  const meta = data.candidates?.[0]?.groundingMetadata;
  const chunks = meta?.groundingChunks ?? [];
  const sentences = chunks.map((): string[] => []);
  for (const support of meta?.groundingSupports ?? []) {
    const text = support.segment?.text?.trim() ?? '';
    if (text === '') continue;
    for (const i of support.groundingChunkIndices ?? []) sentences[i]?.push(text);
  }
  const hits: GeminiHit[] = [];
  chunks.forEach((chunk, i) => {
    const url = chunk.web?.uri ?? '';
    if (url === '') return;
    hits.push({
      title: chunk.web?.title ?? '',
      url,
      snippet: [...new Set(sentences[i])].join(' ').slice(0, SNIPPET_CHARS),
    });
  });
  return hits.slice(0, MAX_RESULTS);
}

/** A Google redirect link becomes the page's own address; anything else is kept as it is. */
async function pageAddress(url: string): Promise<string> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;
  }
  if (host !== REDIRECT_HOST) return url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIRECT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    return response.headers.get('location') ?? url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

/** One grounded search. Throws GeminiSearchError when Gemini cannot answer; the caller decides what follows. */
export async function geminiSearch(query: string, apiKey: string): Promise<GeminiHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let data: GeminiResponse;
  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/${geminiModel()}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: SEARCH_INSTRUCTION + query }] }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!response.ok) {
      throw new GeminiSearchError(`Gemini error ${response.status}: ${await response.text()}`);
    }
    data = (await response.json()) as GeminiResponse;
  } catch (err) {
    if (err instanceof GeminiSearchError) throw err;
    throw new GeminiSearchError((err as Error).message);
  } finally {
    clearTimeout(timer);
  }
  const hits = groundedHits(data);
  const addresses = await Promise.all(hits.map((h) => pageAddress(h.url)));
  return hits.map((h, i) => ({ ...h, url: addresses[i] }));
}
