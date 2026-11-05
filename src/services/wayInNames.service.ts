import { recordClaudeUsage } from './costLedger.service';

/**
 * #8648 (way_in automatic search wastes the budget): the names looked up in the
 * owner's contacts were cut out of web-page headlines by rule — page words,
 * platform names and title separators — and on 4 Nov 653 of 711 lookups found
 * nobody: „მოძებნე | და | იპოვეთ", „Repairs | Emergency", „Op | https | MapQuest".
 * The founder's #8779: no fixed word lists. A small model reads the titles and
 * returns only the real people, companies and businesses they name; a name it
 * returns that is not in a title is dropped, so it cannot invent one.
 */
const WAY_IN_NAMES_MODEL = process.env.WAY_IN_NAMES_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const WAY_IN_NAMES_TIMEOUT_MS = 4_000;
const WAY_IN_NAMES_MAX_TOKENS = 120;
/** The titles read: the top of the result is where the businesses are. */
const MAX_TITLES_READ = 8;
const MAX_TITLE_CHARS = 160;
const NONE = 'none';

const NAMES_PROMPT =
  'These are titles of web pages. List the names of real people, companies, organisations ' +
  'or businesses that the titles name — names a person could have saved in a phonebook ' +
  'or know someone at. Leave out page words, categories, topics, services, places, ' +
  'website addresses and generic phrases. Copy each name exactly as written in the ' +
  `title, one per line, nothing else. If no title names one, reply ${NONE}.`;

function titlesOf(result: unknown): string[] {
  if (result === null || typeof result !== 'object') return [];
  const rows = (result as { results?: unknown }).results;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: unknown) => (row as { title?: unknown } | null)?.title)
    .filter((title): title is string => typeof title === 'string' && title.trim() !== '')
    .slice(0, MAX_TITLES_READ)
    .map((title) => title.slice(0, MAX_TITLE_CHARS));
}

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

/**
 * The names in the model's reply that really stand in one of the titles, in
 * order, without repeats, at most `limit`.
 */
export function namesInTitles(reply: string, titles: readonly string[], limit: number): string[] {
  const haystack = titles.map((title) => title.toLocaleLowerCase());
  const names: string[] = [];
  for (const line of reply.split('\n')) {
    const name = line.replace(/^[\s\-*•\d.)]+/u, '').trim();
    if (name === '' || name.toLowerCase() === NONE) continue;
    const lower = name.toLocaleLowerCase();
    if (!haystack.some((title) => title.includes(lower))) continue;
    if (names.some((kept) => kept.toLocaleLowerCase() === lower)) continue;
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

export interface WayInNamesOrigin {
  readonly userId: string;
  readonly runId?: string | null;
  readonly threadId?: number | null;
}

/** The real names the result's titles carry; empty on no titles, „none" or any failure. */
export async function wayInNamesFrom(
  result: unknown,
  limit: number,
  origin: WayInNamesOrigin,
): Promise<string[]> {
  const titles = titlesOf(result);
  if (titles.length === 0) return [];
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: WAY_IN_NAMES_MODEL,
        max_tokens: WAY_IN_NAMES_MAX_TOKENS,
        system: NAMES_PROMPT,
        messages: [{ role: 'user', content: titles.join('\n') }],
      },
      { timeout: WAY_IN_NAMES_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: origin.userId,
      kind: 'way_in_names',
      model: WAY_IN_NAMES_MODEL,
      usage: response.usage,
      ...(origin.runId ? { runId: origin.runId } : {}),
      ...(origin.threadId ? { threadId: origin.threadId } : {}),
    }).catch(() => undefined);
    return namesInTitles(replyText(response.content), titles, limit);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[way-in] could not read the names in the titles:', (err as Error).message);
    return [];
  }
}
