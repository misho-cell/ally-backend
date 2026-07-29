import { recordClaudeUsage } from './costLedger.service';
import { updateThreadTitle } from './threads.service';
import { emitThreadUpdated } from './sse.service';

// Cheap tier is plenty for a 2–4 word title; overridable without a deploy.
const TITLE_MODEL = process.env.THREAD_TITLE_MODEL?.trim() || 'claude-haiku-4-5';
const TITLE_MAX_TOKENS = 30;
const TITLE_TIMEOUT_MS = 10_000;
const TITLE_MAX_WORDS = 4;
const TITLE_MAX_CHARS = 48;
const TITLE_INPUT_MAX_CHARS = 500;
const TITLE_PROMPT =
  'მომხმარებლის შეტყობინებიდან შეადგინე საუბრის სათაური: ზუსტად 2–4 სიტყვა, იმავე ენაზე, ' +
  'რომელზეც შეტყობინებაა. არავითარი ბრჭყალები, წერტილი ან ახსნა — მხოლოდ სათაური. ' +
  'ტელეფონის ნომერი სათაურში არასდროს ჩაწერო.';

/** Strip quotes/markdown, collapse whitespace, cap at 4 words — or null if unusable. */
export function sanitizeTitle(raw: string): string | null {
  const words = raw
    .replace(/["'"„“”«»*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, TITLE_MAX_WORDS);
  const title = words.join(' ').replace(/[.:,;]+$/, '');
  if (title.length < 2) return null;
  return title.slice(0, TITLE_MAX_CHARS);
}

/**
 * Replace the provisional first-message-slice title with a model-written 2–4
 * word one, then broadcast it (thread_updated) so every device renames the
 * thread live. Fire-and-forget by design: any failure leaves the provisional
 * title in place and never touches the run. The Anthropic client is imported
 * lazily so this module stays loadable in environments without an API key.
 */
export async function generateThreadTitle(
  userId: string,
  threadId: number,
  firstMessage: string,
): Promise<void> {
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: TITLE_MODEL,
        max_tokens: TITLE_MAX_TOKENS,
        system: TITLE_PROMPT,
        messages: [{ role: 'user', content: firstMessage.slice(0, TITLE_INPUT_MAX_CHARS) }],
      },
      { timeout: TITLE_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId,
      kind: 'thread_title',
      model: TITLE_MODEL,
      usage: response.usage,
      threadId,
    }).catch(() => undefined);

    const raw = response.content.map((b) => (b.type === 'text' ? b.text : '')).join(' ');
    const title = sanitizeTitle(raw);
    if (title === null) return;

    await updateThreadTitle(threadId, title);
    emitThreadUpdated(userId, { id: threadId, title });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[title] generation failed for thread ${threadId}:`, (err as Error).message);
  }
}
