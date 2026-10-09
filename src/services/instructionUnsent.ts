import { query } from '../db/postgres/client';
import { instructionSentence, looksLikeContactInstruction, asksForAPreview } from './goalIntent';
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

/**
 * 2906 (the master test run's 45679, SK-013 and old G9, both passing on 5 Oct):
 * „გაუგზავნე იმეილი მაკა ბუღალტერს … ჩამიწერე კალენდარში" and „Tell me … what
 * you know about Nika, Gvantsa…" read as orders to ask a contact, and the
 * owner got only „კითხვა არ გაიგზავნა". An email, a calendar entry or an SMS
 * is not a question through Netai, and „tell me / ask me / send me" speaks to
 * Netai itself. Neither is this guard's to answer.
 */
const NOT_A_NETAI_ASK_RE = /(იმეილ|ი-მეილ|ელფოსტ|კალენდარ|სმს|\bsms\b|e-?mail|calendar)/iu;
/** Words addressed to Netai itself; an instruction is judged without them. */
const SAID_TO_NETAI_RE = /\b(?:tell|ask|send|give|show)\s+me\b/giu;

/** The owner's line, or its instruction sentence, when it tells us to ask one of their contacts. */
export function contactInstructionIn(ownerLine: string): string | null {
  if (asksForAPreview(ownerLine)) return null;
  const sentence = instructionSentence(ownerLine.trim());
  if (NOT_A_NETAI_ASK_RE.test(sentence)) return null;
  return looksLikeContactInstruction(sentence.replace(SAID_TO_NETAI_RE, ' ')) ? sentence : null;
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
                 WHERE k.thread_id = $1)
              -- 2708: an introduction made from this conversation with no goal behind it.
              AND NOT EXISTS (SELECT 1 FROM introduction_requests r WHERE r.origin_thread_id = $1)
              AS silent`,
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

/**
 * T2509 (WIDE GATE, conv 42888): the person named is not on Netai, so nothing
 * can go to them — „write it again" was the wrong answer. Neutral on purpose:
 * whether they have an account is not said (taskAsks, recipient_not_on_netai).
 */
export const NOT_ON_NETAI_LINE: Readonly<Record<RunLanguage, (name: string) => string>> = {
  ka: (name) =>
    `${name} Netai-ზე ჯერ არ არის, ამიტომ კითხვა ვერ გავუგზავნე. შეგიძლია მოიწვიო ან თავად მისწერო.`,
  en: (name) =>
    `${name} is not on Netai yet, so I could not send the question. You can invite them or write to them yourself.`,
  ru: (name) =>
    `${name} пока нет в Netai, поэтому я не смог отправить вопрос. Можешь пригласить или написать сам.`,
  es: (name) =>
    `${name} todavía no está en Netai, así que no pude enviar la pregunta. Puedes invitarle o escribirle tú.`,
};

/**
 * The tester's 46732: „ბესო გამოგონილი-სთვის" — a Georgian name takes „-სთვის"
 * written together („გამოგონილისთვის"); a name in other letters keeps the hyphen.
 */
const ENDS_IN_GEORGIAN_RE = /[ა-ჰ]$/u;

export function forGeorgian(name: string): string {
  return ENDS_IN_GEORGIAN_RE.test(name.trim()) ? `${name.trim()}სთვის` : `${name.trim()}-სთვის`;
}

/**
 * 3268 (the tester's 46678, 0 of 2): the owner named a contact they had marked
 * deceased (or blocked), nothing went, and they read „write it again". One
 * kind line instead, with nothing to retry and no reason spelled out.
 */
export const EXCLUDED_LINE: Readonly<Record<RunLanguage, (name: string) => string>> = {
  ka: (name) => `${forGeorgian(name)} არაფერს ვწერ — ასე მონიშნე. თუ სხვას ვკითხოთ, მითხარი ვის.`,
  en: (name) =>
    `I am not writing to ${name}, as you marked them. If we should ask someone else, tell me who.`,
  ru: (name) => `${name} я не пишу — ты так отметил. Если спросить кого-то другого, скажи кого.`,
  es: (name) =>
    `No escribo a ${name}, así lo marcaste. Si preguntamos a otra persona, dime a quién.`,
};
