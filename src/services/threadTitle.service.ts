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
// The language is DETECTED server-side and named explicitly — asking the
// cheap model to infer "the same language" produced Georgian titles on 6 of
// 10 English conversations (ticket 6 verify, N12.1).
function detectTitleLanguage(text: string): string {
  if (/[ა-ჿ]/.test(text)) return 'Georgian';
  if (/[а-яё]/i.test(text)) return 'Russian';
  if (/[áéíóúñ¿¡]/i.test(text)) return 'Spanish';
  return 'English';
}

function buildTitlePrompt(language: string): string {
  return (
    `You write a 2-4 word conversation title from the exchange below. Write the title in ` +
    `${language} — ONLY ${language}, never mix languages. Never answer the question, never ` +
    'apologize, never refuse: whatever the content, output ONLY a short subject title using ' +
    'real, correctly spelled words that appear in the exchange — never invent or distort a ' +
    'word. No "Title:", no quotes, no emoji, no trailing period, no phone numbers, nothing ' +
    'about yourself as an assistant.'
  );
}

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
// The cheap model's own refusals/apologies must never become titles — six of
// six English titles on 20 Aug were exactly this class ("I dont have access",
// "I appreciate you reaching", ვწუხვარ…).
const REFUSAL_TITLE_RE =
  /^(i\s|i['’]?m\b|i\s?do?n['’]?t|i\s?can|i\s?appreciate|sorry|unfortunately|as an ai|ვწუხვარ|უკაცრავად|ბოდიშ|ვერ\s)/i;

/**
 * Strip the generator's label and quotes/markdown/emoji, collapse whitespace,
 * cap at 4 words, and never cut mid-word — or null if unusable (the caller
 * keeps the provisional title, which is honest text from the user's message).
 */
export function sanitizeTitle(raw: string): string | null {
  if (CYRILLIC.test(raw)) return null;
  if (VENDOR_NAME.test(raw)) return null;
  if (REFUSAL_TITLE_RE.test(raw.trim())) return null;
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
  // The FINAL reply, post-opener-strip (ticket 6 close, task 20): titles made
  // from the user message alone contradicted the answers, and a draft-time
  // title saw text the strip was about to remove.
  finalReply?: string,
): Promise<void> {
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const exchange = finalReply
      ? `USER: ${firstMessage.slice(0, TITLE_INPUT_MAX_CHARS)}\nASSISTANT: ${finalReply.slice(0, TITLE_INPUT_MAX_CHARS)}`
      : firstMessage.slice(0, TITLE_INPUT_MAX_CHARS);
    const response = await anthropic.messages.create(
      {
        model: TITLE_MODEL,
        max_tokens: TITLE_MAX_TOKENS,
        system: buildTitlePrompt(detectTitleLanguage(firstMessage)),
        messages: [{ role: 'user', content: exchange }],
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
