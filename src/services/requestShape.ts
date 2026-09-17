import Anthropic from '@anthropic-ai/sdk';

/**
 * Ticket 20 row 202, sixth pass — the seat's actual question.
 *
 * „Does anything on our side — prompt size, the number of tool results in one
 * turn — change the silence, or is it the provider?" The eight readings taken
 * so far cannot answer it, because every one of them records what came BACK
 * (events, gaps) and nothing about what was SENT. Ranking silences by event
 * count is not an answer either: the longest of a hundred gaps is bigger than
 * the longest of twenty for arithmetic reasons alone, so the apparent rise is
 * at least partly a counting artefact and possibly nothing else.
 *
 * These are the sent-side numbers, and they cost nothing: the token counts sit
 * in the response the API already returns, and the two counts here are a walk
 * over an array the caller is holding anyway.
 *
 * They live in their own file so they can be tested without standing up the
 * chat service, which is the reason the last three measurements went untested.
 */

/** Every tool result in the whole conversation the request carries. */
export function countToolResults(messages: readonly Anthropic.MessageParam[]): number {
  let found = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const block of message.content as Anthropic.ContentBlockParam[]) {
      if (block.type === 'tool_result') found += 1;
    }
  }
  return found;
}

/**
 * Tool results in the LAST turn only — the thing the seat named. A run that
 * hands back six searches at once sends one enormous user message, and that is
 * a different shape of request from sixty results spread over thirty turns.
 */
export function toolResultsInLastTurn(messages: readonly Anthropic.MessageParam[]): number {
  const last = messages[messages.length - 1];
  if (last === undefined || typeof last.content === 'string') return 0;
  return (last.content as Anthropic.ContentBlockParam[]).filter(
    (block) => block.type === 'tool_result',
  ).length;
}
