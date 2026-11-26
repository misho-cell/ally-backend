/**
 * Misho, 26 Nov (point 1): „before the task starts, Netai asks targeted
 * questions to understand as exactly as it can what the owner wants". What to
 * ask is the model's (prompt chat); what is the server's is the full research:
 * it must not start on the words of a request Netai has just asked about. A
 * reply that ends on a question, from a run that searched nothing itself,
 * holds the conversation's full research until the owner's next line, which
 * then travels with it.
 */

/** A question mark, Latin or full-width. */
const QUESTION_END_RE = /[?？]\s*$/u;
/** A model tool that looks for people or for the web: a run that used one has answered. */
const SEARCHING_TOOL_RE = /^(?:search_|web_search$|fetch_page$|find_)/u;
/** How long a held research waits for the owner's answer. */
export const HELD_RESEARCH_MS = 24 * 60 * 60_000;

/** Pure: whether the reply's last line is a question. */
export function endsOnAQuestion(reply: string): boolean {
  const lines = reply
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '');
  return lines.length > 0 && QUESTION_END_RE.test(lines[lines.length - 1]);
}

/** Pure: a run that asked the owner before searching anything itself. */
export function askedBeforeSearching(reply: string, toolsUsed: readonly string[]): boolean {
  return endsOnAQuestion(reply) && !toolsUsed.some((name) => SEARCHING_TOOL_RE.test(name));
}

export interface HeldResearch {
  readonly userId: string;
  readonly taskId: number;
  readonly words: string;
  readonly ownerLine: string;
  readonly askedAt: Date;
}

const askedAt = new Map<number, number>();
const held = new Map<number, HeldResearch & { readonly heldAt: number }>();

/** This conversation's last reply asked the owner before searching. */
export function noteAskedBeforeSearching(threadId: number, now: number = Date.now()): void {
  askedAt.set(threadId, now);
}

/** Whether the conversation waits on the owner's answer to Netai's question. */
export function waitsOnTheOwnersAnswer(threadId: number, now: number = Date.now()): boolean {
  const at = askedAt.get(threadId);
  return at !== undefined && now - at < HELD_RESEARCH_MS;
}

/** Keeps the research until the owner answers. */
export function holdResearch(
  threadId: number,
  research: HeldResearch,
  now: number = Date.now(),
): void {
  held.set(threadId, { ...research, heldAt: now });
}

/**
 * The owner wrote in this conversation: the question is answered. The held
 * research, if any, comes back once, with the answer added to its line.
 */
export function ownerAnsweredTheQuestion(
  threadId: number,
  line: string,
  now: number = Date.now(),
): HeldResearch | null {
  askedAt.delete(threadId);
  const research = held.get(threadId);
  held.delete(threadId);
  if (research === undefined || now - research.heldAt >= HELD_RESEARCH_MS) return null;
  return {
    userId: research.userId,
    taskId: research.taskId,
    words: research.words,
    ownerLine: `${research.ownerLine}\n${line}`,
    askedAt: research.askedAt,
  };
}

/** For tests: forget every conversation. */
export function forgetClarifyingQuestions(): void {
  askedAt.clear();
  held.clear();
}
