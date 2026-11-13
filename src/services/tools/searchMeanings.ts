import { recordClaudeUsage } from '../costLedger.service';
import { QUICK_MODEL, noThinkingFor } from '../aiModels';
import { NO_MEANINGS, WordMeanings } from './transliterate';

/**
 * Misho, 13 Nov (meaning search, at every level): a search matched words and
 * their spelling in the other alphabet, never their meaning in another
 * language — „გაყიდვები" never found „sales", nor „freelance sales" a
 * „business development" label. No fixed word lists (the founder, #8779): a
 * small model gives each concept word of the query its other words of the
 * same meaning, in Georgian, English and Russian, and every level searches a
 * word OR any of them. Any failure gives no meanings, and the search runs on
 * the words as typed.
 */
const MEANINGS_MODEL = process.env.SEARCH_MEANINGS_MODEL?.trim() || QUICK_MODEL;
const MEANINGS_TIMEOUT_MS = 3_000;
const MEANINGS_MAX_TOKENS = 300;
const MAX_QUERY_CHARS = 200;
export const MAX_MEANINGS_PER_WORD = 4;
/** A query's meanings are kept a day: the same words mean the same thing tomorrow. */
export const MEANINGS_KEPT_MS = 24 * 60 * 60 * 1000;
export const MEANINGS_CACHE_SIZE = 500;
const WHITESPACE_RE = /\s/u;

const MEANINGS_PROMPT =
  'You get a SEARCH someone typed to find people in a phonebook and a profile base, where ' +
  'people are described in Georgian, English or Russian ("გაყიდვები", "sales", "продажи"). For ' +
  'each meaning word of the search, give up to 4 other SINGLE words a description of such a ' +
  'person could use instead: the same word in the other two languages, and its closest ' +
  'synonym. Skip names of people and places, and filler words. Never widen the meaning. ' +
  'Reply with JSON only: {"meanings": {"<word as typed>": ["...", "..."]}}.';

interface CachedMeanings {
  readonly at: number;
  readonly meanings: WordMeanings;
}

const cache = new Map<string, CachedMeanings>();

/** Forget every cached meaning — for tests. */
export function forgetMeanings(): void {
  cache.clear();
}

/** One word's meanings as given: single words only, not the word itself, unique, capped. */
function cleanMeanings(word: string, given: unknown): string[] {
  if (!Array.isArray(given)) return [];
  const unique = new Map<string, string>();
  for (const entry of given) {
    if (typeof entry !== 'string') continue;
    const other = entry.trim();
    const key = other.toLowerCase();
    if (other === '' || WHITESPACE_RE.test(other) || key === word || unique.has(key)) continue;
    unique.set(key, other);
  }
  return [...unique.values()].slice(0, MAX_MEANINGS_PER_WORD);
}

/** The meanings the model gave, keyed by the word in lower case; empty when unreadable. */
export function meaningsFromModel(text: string): WordMeanings {
  const match = /\{[\s\S]*\}/u.exec(text);
  if (match === null) return NO_MEANINGS;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    const given =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { meanings?: unknown }).meanings
        : null;
    if (typeof given !== 'object' || given === null || Array.isArray(given)) return NO_MEANINGS;
    const meanings = new Map<string, readonly string[]>();
    for (const [rawWord, others] of Object.entries(given as Record<string, unknown>)) {
      const word = rawWord.trim().toLowerCase();
      const kept = cleanMeanings(word, others);
      if (word !== '' && kept.length > 0) meanings.set(word, kept);
    }
    return meanings;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[search-meanings] reply was not JSON:', (err as Error).message);
    return NO_MEANINGS;
  }
}

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

function cached(key: string, now: number): WordMeanings | null {
  const hit = cache.get(key);
  if (hit === undefined || now - hit.at > MEANINGS_KEPT_MS) return null;
  return hit.meanings;
}

function remember(key: string, meanings: WordMeanings, now: number): void {
  if (cache.size >= MEANINGS_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: now, meanings });
}

async function askTheModel(
  userId: string,
  searched: string,
  runId?: string,
): Promise<WordMeanings> {
  const { default: anthropic } = await import('../../config/anthropic');
  const response = await anthropic.messages.create(
    {
      model: MEANINGS_MODEL,
      ...noThinkingFor(MEANINGS_MODEL),
      max_tokens: MEANINGS_MAX_TOKENS,
      system: MEANINGS_PROMPT,
      messages: [{ role: 'user', content: `SEARCH: ${searched.slice(0, MAX_QUERY_CHARS)}` }],
    },
    { timeout: MEANINGS_TIMEOUT_MS },
  );
  await recordClaudeUsage({
    userId,
    kind: 'search_meanings',
    model: MEANINGS_MODEL,
    usage: response.usage,
    ...(runId !== undefined ? { runId } : {}),
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[search-meanings] usage not recorded:', (err as Error).message);
  });
  return meaningsFromModel(replyText(response.content));
}

/** Each concept word's other words of the same meaning; none on any failure (not remembered). */
export async function searchMeanings(
  userId: string,
  words: unknown,
  runId?: string,
  now: number = Date.now(),
): Promise<WordMeanings> {
  if (typeof words !== 'string' || words.trim() === '') return NO_MEANINGS;
  const key = words.trim().toLowerCase();
  const known = cached(key, now);
  if (known !== null) return known;
  try {
    const meanings = await askTheModel(userId, words.trim(), runId);
    remember(key, meanings, now);
    return meanings;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[search-meanings] could not read the meanings:', (err as Error).message);
    return NO_MEANINGS;
  }
}
