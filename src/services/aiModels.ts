/**
 * Misho, 11 Nov („ყველაფერი ავწიოთ"): every Claude model in one place, on the
 * current generation. Each service still reads its own env variable first, so
 * one route can be moved back without a deploy.
 *
 * Claude Sonnet 5.5 and Haiku 5.5 changed two things the calls relied on:
 * thinking is on by default (Haiku 5.5 at effort medium), and on Sonnet 5.5
 * `thinking: disabled` and a forced `tool_choice` are refused with a 400. The
 * helpers below give each model the form it accepts, so the short, structured
 * calls keep running without thinking, as they did on the models before.
 */
import type Anthropic from '@anthropic-ai/sdk';

export const MAIN_MODEL = 'claude-sonnet-5-5';
export const QUICK_MODEL = 'claude-haiku-5-5';

/**
 * Sonnet 5.5's thinking-off form. The installed SDK (0.100) predates it, so it
 * is typed here once; the API reads it as sent.
 */
const BETWEEN_TOOLS = { type: 'between_tools' } as unknown as Anthropic.ThinkingConfigParam;
const DISABLED: Anthropic.ThinkingConfigParam = { type: 'disabled' };

/** Thinking turned off, in the form this model accepts; nothing for a model that never thinks unasked. */
export function noThinkingFor(model: string): { thinking?: Anthropic.ThinkingConfigParam } {
  if (model.startsWith('claude-sonnet-5-5')) return { thinking: BETWEEN_TOOLS };
  if (model.startsWith('claude-haiku-5') || model.startsWith('claude-sonnet-5')) {
    return { thinking: DISABLED };
  }
  return {};
}

/** Models that refuse a forced tool_choice (`any` / `tool`) with a 400. */
function refusesForcedTool(model: string): boolean {
  return (
    model.startsWith('claude-sonnet-5-5') ||
    model.startsWith('claude-opus-5-5') ||
    model.startsWith('claude-fable-5-1') ||
    model.startsWith('claude-fable-5-2')
  );
}

/**
 * The one-tool call: forced where the model allows it, else `auto` — the brief
 * already asks for that tool, and every caller reads a missing call as „no
 * verdict" and keeps the original.
 */
export function oneToolChoice(
  model: string,
  name: string,
): { type: 'tool'; name: string } | { type: 'auto' } {
  return refusesForcedTool(model) ? { type: 'auto' } : { type: 'tool', name };
}
