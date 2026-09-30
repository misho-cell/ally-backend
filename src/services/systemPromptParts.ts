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

interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export function joinSystemPrompt(stable: string, volatile: string): string {
  return volatile.trim() === '' ? stable : `${stable}${VOLATILE_MARKER}${volatile}`;
}

/** Anthropic system blocks: the breakpoint on the stable part, the tail after it. */
export function systemBlocks(systemPrompt: string): TextBlock[] {
  const at = systemPrompt.indexOf(VOLATILE_MARKER);
  if (at === -1) {
    return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }
  const stable = systemPrompt.slice(0, at);
  const volatile = systemPrompt.slice(at + VOLATILE_MARKER.length);
  return [
    { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile },
  ];
}

/** The same prompt as one plain text, for a provider that caches prefixes on its own. */
export function plainSystemPrompt(systemPrompt: string): string {
  return systemPrompt.split(VOLATILE_MARKER).join('\n\n');
}
