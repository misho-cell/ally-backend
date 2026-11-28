import { depthPickOf, type ResearchDepth } from './researchDepth';

/**
 * Lika, 27 Nov (twice): „the search depth was asked after the search had
 * already started." Misho, the same evening: do it. A new request is held,
 * unsearched, behind the depth card; the owner's pick lets it run, and its
 * full research then goes at that depth with no second card.
 */

/** How long a held request, and a picked depth, wait. */
export const DEPTH_FIRST_HOLD_MS = 24 * 60 * 60_000;

interface Held<T> {
  readonly value: T;
  readonly at: number;
}

interface Pick {
  readonly depth: ResearchDepth;
  /** The request the depth was picked for, with the owner's answers to Netai's questions. */
  readonly request: string;
}

const heldRequests = new Map<number, Held<string>>();
const pickedDepths = new Map<number, Held<Pick>>();

function fresh<T>(store: Map<number, Held<T>>, threadId: number, now: number): T | null {
  const held = store.get(threadId);
  if (held === undefined) return null;
  if (now - held.at < DEPTH_FIRST_HOLD_MS) return held.value;
  store.delete(threadId);
  return null;
}

/** The request waits for the depth pick, unsearched. */
export function holdRequestForDepth(
  threadId: number,
  line: string,
  now: number = Date.now(),
): void {
  heldRequests.set(threadId, { value: line, at: now });
}

export interface PickedRequest {
  readonly line: string;
  readonly depth: ResearchDepth;
}

/**
 * The owner's line under the card: a pick lets the held request run at that
 * depth (once); any other line releases it to run as it is, at no set depth.
 * Null when no request is held here.
 */
export function releaseHeldRequest(
  threadId: number,
  line: string,
  now: number = Date.now(),
): PickedRequest | { readonly line: string; readonly depth: null } | null {
  const held = fresh(heldRequests, threadId, now);
  if (held === null) return null;
  heldRequests.delete(threadId);
  const depth = depthPickOf(line);
  if (depth === null) return { line: `${held}\n${line}`, depth: null };
  pickedDepths.set(threadId, { value: { depth, request: held }, at: now });
  return { line: held, depth };
}

/** The depth the owner picked before the search began, if any. */
export function pickedDepthFor(threadId: number, now: number = Date.now()): ResearchDepth | null {
  return fresh(pickedDepths, threadId, now)?.depth ?? null;
}

/**
 * The first real request, 28 Nov: the depth was picked, Netai asked a question
 * before searching, and the owner's answer was searched alone, so the research
 * never formed. While the pick is unspent, the answer joins the request it was
 * picked for, and that is what is searched. Null when no pick waits here.
 */
export function requestWithAnswer(
  threadId: number,
  answer: string,
  now: number = Date.now(),
): string | null {
  const pick = fresh(pickedDepths, threadId, now);
  if (pick === null) return null;
  const request = `${pick.request}\n${answer}`;
  pickedDepths.set(threadId, { value: { depth: pick.depth, request }, at: now });
  return request;
}

/** The research this depth was picked for has started: the pick is spent. */
export function spendPickedDepth(threadId: number): void {
  pickedDepths.delete(threadId);
}

/** For tests: forget every conversation. */
export function forgetDepthFirst(): void {
  heldRequests.clear();
  pickedDepths.clear();
}
