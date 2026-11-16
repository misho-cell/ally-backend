import { recordClaudeUsage } from '../costLedger.service';
import { QUICK_MODEL, noThinkingFor } from '../aiModels';

/**
 * Misho, 16 Nov (the tester's thermos case): „30 branded thermoses for our
 * team" was searched only by its own words, and her own contact saved as a
 * print shop („salome Printi", „ბეჭდვა") was never offered — printing is how
 * branded thermoses get made, and nothing searched for it. No fixed word lists
 * (the founder, #8779): a small model names the trades and kinds of provider
 * who could deliver the request, and the full research searches each of them
 * as fully as the request's own words. Any failure gives none.
 */
const RELATED_MODEL = process.env.RELATED_TRADES_MODEL?.trim() || QUICK_MODEL;
const RELATED_TIMEOUT_MS = 4_000;
const RELATED_MAX_TOKENS = 200;
const MAX_LINE_CHARS = 300;
export const MAX_RELATED_TRADES = 4;
/** A trade is one to three words; a sentence is not a search. */
const MAX_TRADE_WORDS = 3;
const KEPT_MS = 24 * 60 * 60 * 1000;
const CACHE_SIZE = 500;

const RELATED_PROMPT =
  'You get a REQUEST someone wrote to find who can help them, and the SEARCH words taken from ' +
  'it. Name up to 4 OTHER trades or kinds of provider who could deliver exactly this, the way ' +
  'people in Georgia describe such a person or firm in a phonebook — e.g. for branded thermoses: ' +
  '"ბეჭდვა", "სტამბა", "სარეკლამო სუვენირები", "კორპორატიული საჩუქრები". Each one to three ' +
  'words, in Georgian, most likely first. Never repeat the search words, never a place, never ' +
  'a person. When nobody else could deliver it, give none. ' +
  'Reply with JSON only: {"related": ["...", "..."]}.';

interface Cached {
  readonly at: number;
  readonly related: readonly string[];
}

const cache = new Map<string, Cached>();

/** Forget everything cached — for tests. */
export function forgetRelatedTrades(): void {
  cache.clear();
}

/** The trades the model gave: short, distinct, none of the search words, capped. */
export function relatedFromModel(text: string, searchWords: string): string[] {
  const match = /\{[\s\S]*\}/u.exec(text);
  if (match === null) return [];
  try {
    const given = (JSON.parse(match[0]) as { related?: unknown }).related;
    if (!Array.isArray(given)) return [];
    const own = new Set(searchWords.toLowerCase().split(/\s+/u));
    const kept = new Map<string, string>();
    for (const entry of given) {
      if (typeof entry !== 'string') continue;
      const trade = entry.trim();
      const key = trade.toLowerCase();
      const words = key.split(/\s+/u).filter(Boolean);
      if (words.length === 0 || words.length > MAX_TRADE_WORDS || own.has(key)) continue;
      if (!kept.has(key)) kept.set(key, trade);
    }
    return [...kept.values()].slice(0, MAX_RELATED_TRADES);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[related-trades] reply was not JSON:', (err as Error).message);
    return [];
  }
}

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

function remember(key: string, related: readonly string[], now: number): void {
  if (cache.size >= CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: now, related });
}

async function askTheModel(userId: string, line: string, words: string): Promise<string[]> {
  const { default: anthropic } = await import('../../config/anthropic');
  const response = await anthropic.messages.create(
    {
      model: RELATED_MODEL,
      ...noThinkingFor(RELATED_MODEL),
      max_tokens: RELATED_MAX_TOKENS,
      system: RELATED_PROMPT,
      messages: [
        {
          role: 'user',
          content: `REQUEST: ${line.slice(0, MAX_LINE_CHARS)}\nSEARCH: ${words.slice(0, MAX_LINE_CHARS)}`,
        },
      ],
    },
    { timeout: RELATED_TIMEOUT_MS },
  );
  await recordClaudeUsage({
    userId,
    kind: 'related_trades',
    model: RELATED_MODEL,
    usage: response.usage,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[related-trades] usage not recorded:', (err as Error).message);
  });
  return relatedFromModel(replyText(response.content), words);
}

/** The trades who could deliver this besides the search's own words; none on any failure. */
export async function relatedTrades(
  userId: string,
  ownerLine: string,
  words: string,
  now: number = Date.now(),
): Promise<string[]> {
  if (words.trim() === '') return [];
  const key = `${ownerLine.trim().toLowerCase()}\n${words.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit !== undefined && now - hit.at <= KEPT_MS) return [...hit.related];
  try {
    const related = await askTheModel(userId, ownerLine.trim() || words, words.trim());
    remember(key, related, now);
    return related;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[related-trades] could not be read:', (err as Error).message);
    return [];
  }
}
