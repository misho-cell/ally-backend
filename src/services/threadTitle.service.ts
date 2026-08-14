import { recordClaudeUsage } from './costLedger.service';
import { updateThreadTitle } from './threads.service';
import { emitThreadUpdated } from './sse.service';

// Cheap tier is plenty for a 2–4 word title; overridable without a deploy.
// Dated id on purpose — it is the key provider_prices is seeded under, so the
// cost ledger prices the call instead of warning "missing price".
const TITLE_MODEL = process.env.THREAD_TITLE_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const TITLE_MAX_TOKENS = 30;
const TITLE_TIMEOUT_MS = 10_000;
const TITLE_MAX_WORDS = 4;
const TITLE_MAX_CHARS = 48;
const TITLE_INPUT_MAX_CHARS = 500;
const TITLE_PROMPT =
  'მომხმარებლის შეტყობინებიდან შეადგინე საუბრის სათაური: ზუსტად 2–4 სიტყვა, მხოლოდ იმ ენაზე, ' +
  'რომელზეც შეტყობინებაა — ენების შერევა აკრძალულია. გამოიყენე მხოლოდ ის საგანი/სიტყვები, რაც ' +
  'შეტყობინებაშია — არაფერი გამოიგონო; თუ მკაფიო საგანი არ ჩანს, გამოიყენე შეტყობინების პირველი ' +
  'სიტყვები. საკუთარ თავზე (ასისტენტზე) სათაური არასდროს — ასეთ კითხვას უპასუხე შეტყობინების ' +
  'სიტყვებით. უპასუხე მხოლოდ თვითონ სათაურით: არავითარი „სათაური:", ბრჭყალები, ემოჯი, წერტილი ' +
  'ან ახსნა. ტელეფონის ნომერი სათაურში არასდროს ჩაწერო.';

// The generator's own preamble, in every wording it has produced live —
// "სათაური: X" and "საუბრის სათაური: X" reached users as the visible title
// (ticket 4 item 0C.7: six of nine thread titles malformed in one run).
const TITLE_LABEL_PREFIX = /^\s*(?:საუბრის\s+)?(?:სათაური|title)\s*[:\-—]\s*/iu;
// Anything outside Georgian/Latin letters, digits and basic punctuation —
// kills emoji; Cyrillic is checked separately so it can be REJECTED, because a
// Russian word inside a Georgian title means the model drifted, not decorated.
const TITLE_DISALLOWED_CHARS = /[^\p{Script=Georgian}\p{Script=Latin}0-9 ,.'&()-]/gu;
const CYRILLIC = /\p{Script=Cyrillic}/u;
// The generator must never name the underlying vendor/model: "AI ასისტენტი
// Claude" reached a user as a visible title (ticket 6 B3, thread 9103). The
// product's assistant has no such name anywhere in the UI.
const VENDOR_NAME = /claude|anthropic|კლოდ/iu;

/**
 * Strip the generator's label and quotes/markdown/emoji, collapse whitespace,
 * cap at 4 words, and never cut mid-word — or null if unusable (the caller
 * keeps the provisional title, which is honest text from the user's message).
 */
export function sanitizeTitle(raw: string): string | null {
  if (CYRILLIC.test(raw)) return null;
  if (VENDOR_NAME.test(raw)) return null;
  const words = raw
    .replace(TITLE_LABEL_PREFIX, '')
    .replace(/["'"„“”«»*_`#]/g, '')
    .replace(TITLE_DISALLOWED_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, TITLE_MAX_WORDS);
  const title = words.join(' ').replace(/[.:,;]+$/, '');
  if (title.length < 2) return null;
  if (title.length <= TITLE_MAX_CHARS) return title;
  // Over the cap: drop whole words from the end, never characters — "ღრმაწყლოვანი
  // თევზჭერა ნორვეგ" (a hard cut mid-word) is worse than a shorter title.
  const cut = title.slice(0, TITLE_MAX_CHARS + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, TITLE_MAX_CHARS)).replace(
    /[.:,;]+$/,
    '',
  );
  return trimmed.length >= 2 ? trimmed : null;
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
