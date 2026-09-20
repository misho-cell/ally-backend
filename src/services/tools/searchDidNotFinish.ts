/**
 * What a search says when it could not run — as opposed to when it ran and
 * found nobody.
 *
 * THE TWO WERE THE SAME SENTENCE IN SIX TOOLS. Every one of them ended:
 *
 *   catch (err) {
 *     return { found: false, error: (err as Error).message };
 *   }
 *
 * and `{ found: false }` is what each of them returns when NOBODY MATCHED. So
 * a database timeout and an empty network arrived at the model identically,
 * and the model said the only thing that shape means: there is nobody.
 *
 * It is not hypothetical. Seven days to 20 September, from `tool_call_log`:
 *
 *   search_second_degree:opening   152 calls, **51 FAILED** — every one
 *                                  „canceling statement due to statement
 *                                  timeout" at about 16.4 seconds
 *   get_country_channels             6 calls, **3 FAILED** — the same
 *
 * A third of the searches that run when a goal opens, reported to somebody as
 * an empty second circle.
 *
 * This is the substitution this codebase keeps having to undo. `runStatus` has
 * a paragraph on it („an error wearing the clothes of a confident answer");
 * the `neo4j_unavailable` branch in searchSecondDegree already gets it right
 * and has for weeks; the admin screens exist partly to prevent it. It survived
 * in the one place it does the most damage — the tools that decide whether a
 * person's network has anybody in it.
 *
 * AND THE RAW DATABASE STRING IS GONE. „canceling statement due to statement
 * timeout" told the model nothing it could act on, and CLAUDE.md forbids it
 * reaching a client at all.
 */

export interface SearchDidNotFinish {
  readonly found: false;
  readonly reason: 'search_timed_out' | 'search_failed';
  readonly note: string;
}

const TIMEOUT = /statement timeout|query_canceled|ETIMEDOUT|timeout exceeded/i;

/**
 * @param what the search, in words the model can put in a sentence —
 *   „the second-degree search", „the tag search". It goes into the note.
 */
export function searchDidNotFinish(what: string, err: unknown): SearchDidNotFinish {
  const message = err instanceof Error ? err.message : String(err);
  return {
    found: false,
    reason: TIMEOUT.test(message) ? 'search_timed_out' : 'search_failed',
    note:
      `${what} DID NOT FINISH — this is a technical failure on our side, not an empty ` +
      'network, and it says nothing about whether anybody is there. Do NOT tell the user ' +
      'nobody was found and do NOT count this as a route that came back empty. Say plainly ' +
      'that this one search did not complete, carry on with everything else you have, and ' +
      'offer to try it again.',
  };
}
