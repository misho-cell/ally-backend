import type Anthropic from '@anthropic-ai/sdk';

/**
 * #8548 (the tester's 80752 item 15, cases 21, 45, 95, 130): replies opened with
 * „წინა პასუხში შეცდომა დავუშვი…" on a thread with no earlier answer. The
 * model's narration before a tool call was not shown — dropped for a foreign
 * script, or a round whose step is never published — but it stayed in the
 * run's history, and the final answer (Claude's or the GPT rewrite) corrected
 * words the owner never read. A narration that was not shown leaves the history
 * the run carries on with; its tool calls stay.
 */
export function assistantTurnForHistory(
  content: readonly Anthropic.ContentBlock[],
  narrationShown: boolean,
): Anthropic.ContentBlock[] {
  if (narrationShown) return [...content];
  const withoutText = content.filter((block) => block.type !== 'text');
  return withoutText.some((block) => block.type === 'tool_use') ? withoutText : [...content];
}
