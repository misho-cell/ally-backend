import { hasGeorgian } from './tools/transliterate';

/**
 * Misho, 13 Nov (a real member's „who is Rompetrol Georgia's director"): our
 * one search was English, found the group's Romanian pages and never the
 * Georgian director, while a Georgian search answers it at once. So the first
 * web search of a run is in Georgian, and when it does not answer, the model
 * writes up to five different searches, choosing each next one itself.
 */
export const MAX_SEARCHES_PER_QUESTION = 5;

export const FIRST_SEARCH_IN_GEORGIAN =
  'Not searched: the first web search is always in Georgian. Write this same question in ' +
  'Georgian words — for example „ვინ არის <company>-ის გენერალური დირექტორი" — and search ' +
  'again; searches in English or other languages may follow it.';

const runWebSearches = new Map<string, number>();

/** True when this would be the run's first web search and it has no Georgian in it. */
export function firstSearchNotInGeorgian(runId: string, query: string): boolean {
  return (runWebSearches.get(runId) ?? 0) === 0 && !hasGeorgian(query);
}

/** Counts one web search the run made; the count so far. */
export function countWebSearch(runId: string): number {
  const made = (runWebSearches.get(runId) ?? 0) + 1;
  runWebSearches.set(runId, made);
  return made;
}

/** What rides with the results: which search this is, and what to do if it did not answer. */
export function searchRoundNote(made: number): string {
  if (made >= MAX_SEARCHES_PER_QUESTION) {
    return (
      `Web search ${made}; ${MAX_SEARCHES_PER_QUESTION} is the most for one question. If this ` +
      'is still the same question and the answer is not here, stop searching for it: say ' +
      'plainly what you found and what you did not.'
    );
  }
  return (
    `Web search ${made} of up to ${MAX_SEARCHES_PER_QUESTION} for one question. If these ` +
    'results do not answer it, decide the next search yourself and make it different: other ' +
    'words, English or Russian, the exact title, the organisation’s own site or a news site. ' +
    'Never the same search again.'
  );
}

export function forgetWebSearches(runId: string): void {
  runWebSearches.delete(runId);
}
