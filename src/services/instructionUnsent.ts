import { query } from '../db/postgres/client';
import { instructionSentence, looksLikeContactInstruction } from './goalIntent';
import { RunLanguage } from './runLanguage';
import { messageNamesOwnContact } from './tools/nameMatch';

/**
 * The tester's 44364 (case 1, runs 5 and 6, 7 Oct): the owner typed „ჰკითხე
 * <helper>-ს, იცნობს თუ არა გია ბერიძეს და გამაცნობს თუ არა" — an instruction
 * naming one of their own contacts, which is the permission itself (D316). The
 * run searched both names, then either promised „I'll ask" or wrote the
 * question back to the owner as its reply, and nobody was asked. The promise
 * guard (#830, 1149) only reads a goal without a plan, or a quick answer; with
 * no goal on an ordinary owner turn nothing noticed.
 *
 * Fails towards false: a read that cannot look does not accuse.
 */
const QUERY_TIMEOUT_MS = 4_000;

/** The owner's line, or its instruction sentence, when it tells us to ask one of their contacts. */
export function contactInstructionIn(ownerLine: string): string | null {
  const sentence = instructionSentence(ownerLine.trim());
  return looksLikeContactInstruction(sentence) ? sentence : null;
}

/** True when no goal on this conversation has asked, held or introduced anybody. */
async function threadSentNothing(threadId: number): Promise<boolean> {
  try {
    const result = await query<{ silent: boolean }>(
      `SELECT NOT EXISTS (
                SELECT 1 FROM tasks k JOIN task_asks a ON a.task_id = k.id WHERE k.thread_id = $1)
              AND NOT EXISTS (
                SELECT 1 FROM tasks k JOIN held_asks h ON h.task_id = k.id WHERE k.thread_id = $1)
              AND NOT EXISTS (
                SELECT 1 FROM tasks k JOIN introduction_requests r ON r.requester_task_id = k.id
                 WHERE k.thread_id = $1) AS silent`,
      [threadId],
      QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.silent === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[instruction-unsent] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}

/**
 * The owner told us to ask one of their own people, and nothing has gone to
 * anybody from this conversation. The caller has already seen that this run
 * called none of the tools that would send.
 */
export async function instructionLeftUnsent(
  userId: string,
  threadId: number,
  ownerLine: string,
): Promise<boolean> {
  const sentence = contactInstructionIn(ownerLine);
  if (sentence === null) return false;
  if (!(await messageNamesOwnContact(userId, sentence))) return false;
  return threadSentNothing(threadId);
}

/**
 * The tester's 44367 (wish 3): when the turn that was given one more chance
 * still sent nothing, it may not say „I will ask". The owner is told plainly
 * that the question did not go.
 */
export const NOT_SENT_LINE: Readonly<Record<RunLanguage, string>> = {
  ka: 'კითხვა არ გაიგზავნა. გთხოვ, თხოვნა კიდევ ერთხელ მომწერე.',
  en: 'The question was not sent. Please write the request to me once more.',
  ru: 'Вопрос не отправлен. Пожалуйста, напишите просьбу ещё раз.',
  es: 'La pregunta no se envió. Por favor, escríbeme la petición otra vez.',
};
