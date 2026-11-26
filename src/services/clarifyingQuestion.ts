/**
 * The full research a conversation holds back, and why.
 *
 * Misho, 26 Nov (point 2): the owner picks how deep the full research goes,
 * so it is held until the pick (researchDepth.ts).
 *
 * Misho, 26 Nov (point 1): „before the task starts, Netai asks targeted
 * questions to understand as exactly as it can what the owner wants". What to
 * ask is the model's (prompt chat); the server's part is that nothing starts on
 * a request Netai has just asked about. A reply that ends on a question, from
 * a run that searched nothing itself, offers no depth yet: the owner's next
 * line is added to the held research, and the depth is offered then.
 */

/** A question mark, Latin or full-width. */
const QUESTION_END_RE = /[?？]\s*$/u;
/** A model tool that looks for people or for the web: a run that used one has answered. */
const SEARCHING_TOOL_RE = /^(?:search_|web_search$|fetch_page$|find_)/u;
/** How long a held research waits for the owner. */
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

interface Held extends HeldResearch {
  readonly heldAt: number;
}

const askedAt = new Map<number, number>();
const held = new Map<number, Held>();

/** This conversation's last reply asked the owner before searching. */
export function noteAskedBeforeSearching(threadId: number, now: number = Date.now()): void {
  askedAt.set(threadId, now);
}

/** Whether the conversation waits on the owner's answer to Netai's question. */
export function waitsOnTheOwnersAnswer(threadId: number, now: number = Date.now()): boolean {
  const at = askedAt.get(threadId);
  return at !== undefined && now - at < HELD_RESEARCH_MS;
}

/** Keeps the research until the owner picks its depth. Returns the hold's mark, for its timer. */
export function holdResearch(
  threadId: number,
  research: HeldResearch,
  now: number = Date.now(),
): number {
  held.set(threadId, { ...research, heldAt: now });
  return now;
}

function fresh(threadId: number, now: number): Held | null {
  const research = held.get(threadId);
  if (research === undefined) return null;
  if (now - research.heldAt < HELD_RESEARCH_MS) return research;
  held.delete(threadId);
  return null;
}

/**
 * The owner wrote in this conversation. When they were answering Netai's
 * question and a research is held, their answer joins its line and the depth
 * is offered now: true.
 */
export function ownerAnsweredTheQuestion(
  threadId: number,
  line: string,
  now: number = Date.now(),
): boolean {
  const waiting = waitsOnTheOwnersAnswer(threadId, now);
  askedAt.delete(threadId);
  const research = fresh(threadId, now);
  if (!waiting || research === null) return false;
  held.set(threadId, { ...research, ownerLine: `${research.ownerLine}\n${line}` });
  return true;
}

function released(research: Held, line: string | null): HeldResearch {
  return {
    userId: research.userId,
    taskId: research.taskId,
    words: research.words,
    ownerLine: line === null ? research.ownerLine : `${research.ownerLine}\n${line}`,
    askedAt: research.askedAt,
  };
}

/**
 * Lika, 26 Nov: the depth card sat among five cards, she answered the reply's
 * own question instead, and the full answer never came. A line that is not a
 * pick, while no question of Netai's is waiting, releases the held research
 * with that line added: it then runs at the standard depth.
 */
export function ownerWroteInstead(
  threadId: number,
  line: string,
  now: number = Date.now(),
): HeldResearch | null {
  if (waitsOnTheOwnersAnswer(threadId, now)) return null;
  const research = fresh(threadId, now);
  if (research === null) return null;
  held.delete(threadId);
  return released(research, line);
}

/** The research held at this mark, once, when nobody picked in time; null when it is gone or newer. */
export function takeUnpickedResearch(
  threadId: number,
  mark: number,
  now: number = Date.now(),
): HeldResearch | null {
  if (waitsOnTheOwnersAnswer(threadId, now)) return null;
  const research = fresh(threadId, now);
  if (research === null || research.heldAt !== mark) return null;
  held.delete(threadId);
  return released(research, null);
}

/** The held research, once: the owner picked its depth. */
export function takeHeldResearch(threadId: number, now: number = Date.now()): HeldResearch | null {
  const research = fresh(threadId, now);
  held.delete(threadId);
  return research === null ? null : released(research, null);
}

/** For tests: forget every conversation. */
export function forgetClarifyingQuestions(): void {
  askedAt.clear();
  held.clear();
}
