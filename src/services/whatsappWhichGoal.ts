import { replyInWhatsapp } from './whatsappChannel.service';

/**
 * Misho, 24 Nov: „when a new request comes in and it is not sure whether it
 * is the old task or a new one, let it ask the user." The line waits here
 * while the person is asked; their answer sends it on, to the goal's
 * conversation or a new one. Any other line moves on and the held one goes
 * to the conversation it came to, so nothing they wrote is lost.
 */

/** How long a held line waits for its answer. */
const HELD_MS = 30 * 60_000;
const GEORGIAN_LETTER = /[ა-ჿ]/u;

export enum WhichAnswer {
  SameGoal = 'same',
  NewRequest = 'new',
}

interface HeldLine {
  readonly threadId: number;
  readonly line: string;
  readonly until: number;
  readonly choices: readonly [string, string];
}

const held = new Map<number, HeldLine>();

/** Forget everything held — for tests. */
export function forgetHeldLines(): void {
  held.clear();
}

const TEXTS = {
  ka: {
    question: (goal: string): string => `ეს „${goal}"-ს ეხება, თუ ახალი მოთხოვნაა?`,
    same: 'ამას ეხება',
    fresh: 'ახალი მოთხოვნაა',
  },
  en: {
    question: (goal: string): string => `Is this about „${goal}", or a new request?`,
    same: 'About that',
    fresh: 'A new request',
  },
} as const;

/** Pure: the question and its two buttons, in the line's own script. */
export function whichQuestion(
  goal: string,
  line: string,
): { text: string; choices: [string, string] } {
  const t = GEORGIAN_LETTER.test(line) ? TEXTS.ka : TEXTS.en;
  return { text: t.question(goal), choices: [t.same, t.fresh] };
}

/** Holds the line and asks which it is. Never throws; a failed ask keeps nothing held. */
export async function askWhichGoal(
  userId: number,
  phone: string,
  threadId: number,
  goal: string,
  line: string,
  now: number = Date.now(),
): Promise<boolean> {
  const { text, choices } = whichQuestion(goal, line);
  try {
    held.set(userId, { threadId, line, until: now + HELD_MS, choices });
    await replyInWhatsapp(userId, phone, text, threadId, choices);
    return true;
  } catch (err) {
    held.delete(userId);
    // eslint-disable-next-line no-console
    console.error('[whatsapp-routing] which-goal question not sent:', (err as Error).message);
    return false;
  }
}

/** Pure: which button a reply is — its title, or „1" / „2" — or null for anything else. */
export function answerOf(reply: string, choices: readonly [string, string]): WhichAnswer | null {
  const said = reply.trim().toLocaleLowerCase();
  if (said === '1' || said === choices[0].toLocaleLowerCase()) return WhichAnswer.SameGoal;
  if (said === '2' || said === choices[1].toLocaleLowerCase()) return WhichAnswer.NewRequest;
  return null;
}

export interface HeldLineTaken {
  readonly threadId: number;
  readonly line: string;
  /** Null when the reply was not an answer: the line goes where it came, and the reply on. */
  readonly answer: WhichAnswer | null;
}

/** The line held for this person, once, with their answer if this reply is one. */
export function takeHeldLine(
  userId: number,
  reply: string,
  now: number = Date.now(),
): HeldLineTaken | null {
  const line = held.get(userId);
  if (line === undefined) return null;
  held.delete(userId);
  if (line.until < now) return null;
  return { threadId: line.threadId, line: line.line, answer: answerOf(reply, line.choices) };
}
