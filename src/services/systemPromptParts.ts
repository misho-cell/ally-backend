/**
 * ⚠️ THE SYSTEM PROMPT WAS RE-WRITTEN TO THE CACHE ON EVERY RUN — account
 * 172662, 30 September, read from usage_events.
 *
 * Twenty paid messages spent 370 tokens (≈ $3.36). On every one of them the
 * cache READ was exactly 24,702 tokens — the tool definitions — and the cache
 * WRITE was ~47,000, even between two messages sixty seconds apart. A write is
 * 12.5× the price of a read, so a one-call, 500-token reply cost 13 tokens.
 *
 * Row 130 (28 Sep) had already put the per-minute clock LAST in the system
 * prompt, and that was right but not enough: the prompt went to the API as ONE
 * block with its cache breakpoint at the END, i.e. after the clock. A cache
 * hit can only land on a breakpoint, and that one differed every minute, so
 * the nearest reusable breakpoint was the end of the tools. Everything in the
 * system prompt was paid for again on every call.
 *
 * So the prompt travels as two parts: the stable part carries the breakpoint,
 * and the volatile tail (the clock, a one-run note) follows it uncached. The
 * two are kept in one string with an explicit marker so every existing caller
 * keeps passing a string; only the two places that send it to a model know.
 */
export const VOLATILE_MARKER = '\n\n<<<volatile-system-tail>>>\n\n';

/**
 * ⚠️ AND THE STABLE PART WAS NOT STABLE — measured the afternoon the split
 * above shipped, from usage_events.
 *
 * The first call of a run still read exactly the tool definitions (25,296
 * tokens) and WROTE 22,000–66,000; the average write per call was 15,400
 * before f34ea7e and 15,600–18,200 after it. The clock was never the main
 * cost. The „stable" part holds the owner's goals, notes and pending
 * requests, which change between one run and the next, and a change anywhere
 * in it threw away the part in front of it too: the base prompt, the
 * injection defence and the mode blocks, which are the same for every
 * account.
 *
 * So the stable part carries a second breakpoint, after that global head.
 * Four is the API's limit and this makes four: the tools, the global head,
 * the per-account part, and the last message.
 */
export const GLOBAL_MARKER = '\n\n<<<global-system-head>>>\n\n';

/**
 * THE SHARED HEAD IS KEPT FOR AN HOUR — Misho's word, 30 September.
 *
 * Measured after af738d6: when another account's run began under five minutes
 * earlier, the first call read the shared head 44% of the time (1% before),
 * and was about 8% cheaper. But most runs start more than five minutes after
 * the last one, and on those the five-minute entry had already expired. An
 * hour-long entry costs twice the input rate to write instead of 1.25×, and is
 * read at the same tenth — so it pays as soon as one run in an hour reads it.
 *
 * The API requires longer-lived entries BEFORE shorter ones, so the tools
 * (in front of the system prompt) carry the hour too; the per-account part and
 * the last message stay at five minutes.
 */
export const CACHE_ONE_HOUR = { type: 'ephemeral', ttl: '1h' } as const;
const CACHE_FIVE_MINUTES = { type: 'ephemeral' } as const;

interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: typeof CACHE_ONE_HOUR | typeof CACHE_FIVE_MINUTES;
}

/** The stable part: what every account shares, then what is this account's. */
export function joinStablePrompt(globalHead: string, perAccount: string): string {
  return `${globalHead}${GLOBAL_MARKER}${perAccount}`;
}

/** Cached blocks for the stable part, split at the global head when it is marked. */
function stableBlocks(stable: string): TextBlock[] {
  const at = stable.indexOf(GLOBAL_MARKER);
  if (at === -1) return [{ type: 'text', text: stable, cache_control: CACHE_FIVE_MINUTES }];
  return [
    { type: 'text', text: stable.slice(0, at), cache_control: CACHE_ONE_HOUR },
    {
      type: 'text',
      text: stable.slice(at + GLOBAL_MARKER.length),
      cache_control: CACHE_FIVE_MINUTES,
    },
  ];
}

export function joinSystemPrompt(stable: string, volatile: string): string {
  return volatile.trim() === '' ? stable : `${stable}${VOLATILE_MARKER}${volatile}`;
}

/** Anthropic system blocks: the breakpoint on the stable part, the tail after it. */
export function systemBlocks(systemPrompt: string): TextBlock[] {
  const at = systemPrompt.indexOf(VOLATILE_MARKER);
  if (at === -1) return stableBlocks(systemPrompt);
  const stable = systemPrompt.slice(0, at);
  const volatile = systemPrompt.slice(at + VOLATILE_MARKER.length);
  return [...stableBlocks(stable), { type: 'text', text: volatile }];
}

/** The same prompt as one plain text, for a provider that caches prefixes on its own. */
export function plainSystemPrompt(systemPrompt: string): string {
  return systemPrompt.split(VOLATILE_MARKER).join('\n\n').split(GLOBAL_MARKER).join('\n\n');
}
