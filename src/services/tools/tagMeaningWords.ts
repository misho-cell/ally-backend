import { recordClaudeUsage } from '../costLedger.service';

/**
 * Tester's report 8 Nov, C6 and C7: the owner had Levan saved as „fish farm
 * Turkey" and Koba as „construction"; the searches for „კრევეტი" and
 * „ელექტრიკოსი" matched no label, and the run said there was nobody in his
 * network. The tag search matches words and their spelling in the other
 * alphabet, not their meaning in the other language.
 *
 * The founder's #8779: no fixed word lists. When a tag search finds nothing, a
 * small model reads the query's meaning and gives a few words people save
 * contacts under for it, in Georgian and in English; the search runs once more
 * on each. Any failure gives no words, and the empty result stands.
 */
const TAG_WORDS_MODEL = process.env.TAG_WORDS_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const TAG_WORDS_TIMEOUT_MS = 4_000;
const TAG_WORDS_MAX_TOKENS = 120;
const MAX_QUERY_CHARS = 200;
export const MAX_TAG_WORDS = 6;

const TAG_WORDS_PROMPT =
  'People save their phone contacts under short labels: a trade, a field, a company or a ' +
  'place, in Georgian or English (e.g. "ელექტრიკოსი", "construction", "fish farm Turkey"). ' +
  'You get a SEARCH that found no label. Give up to 6 other short labels a person who fits ' +
  'this search could be saved under — the same meaning in the other language, and the field ' +
  'or trade it belongs to. One or two words each. Reply with JSON only: {"words": ["..."]}.';

/** The words the model gave, trimmed, without the query itself; at most MAX_TAG_WORDS. */
export function tagWordsFromModel(text: string, query: string): string[] {
  const match = /\{[\s\S]*\}/u.exec(text);
  if (match === null) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    const words =
      typeof parsed === 'object' && parsed !== null ? (parsed as { words?: unknown }).words : null;
    if (!Array.isArray(words)) return [];
    const own = query.trim().toLowerCase();
    const unique = new Map<string, string>();
    for (const w of words) {
      if (typeof w !== 'string') continue;
      const word = w.trim();
      const key = word.toLowerCase();
      if (word !== '' && key !== own && !unique.has(key)) unique.set(key, word);
    }
    return [...unique.values()].slice(0, MAX_TAG_WORDS);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[tag-words] reply was not JSON:', (err as Error).message);
    return [];
  }
}

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

/** Other labels for a tag search that found nothing; [] when the model cannot be read. */
export async function tagMeaningWords(userId: string, query: string): Promise<string[]> {
  if (query.trim() === '') return [];
  try {
    const { default: anthropic } = await import('../../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: TAG_WORDS_MODEL,
        max_tokens: TAG_WORDS_MAX_TOKENS,
        system: TAG_WORDS_PROMPT,
        messages: [{ role: 'user', content: `SEARCH: ${query.slice(0, MAX_QUERY_CHARS)}` }],
      },
      { timeout: TAG_WORDS_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId,
      kind: 'tag_meaning_words',
      model: TAG_WORDS_MODEL,
      usage: response.usage,
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[tag-words] usage not recorded:', (err as Error).message);
    });
    return tagWordsFromModel(replyText(response.content), query);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[tag-words] could not read other labels:', (err as Error).message);
    return [];
  }
}
