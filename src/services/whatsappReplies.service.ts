import { asReplyButtons, replyInWhatsapp } from './whatsappChannel.service';

/**
 * The answers owed in WhatsApp: a line the person typed there starts a run in
 * one of their conversations, and when that run ends its answer goes back to
 * them there (sse.service calls deliverOwedWhatsappReply). Kept apart from the
 * inbound handling so the event bus imports nothing heavier than the sender.
 */
const OWED_REPLY_TTL_MS = 10 * 60_000;
const MAX_NUMBERED_CHOICES = 10;

interface OwedReply {
  readonly phone: string;
  readonly until: number;
}
const owedReplies = new Map<string, OwedReply>();
/** The choices last offered, so a typed „2" means the second one. */
const lastChoices = new Map<number, readonly string[]>();

const owedKey = (userId: number, threadId: number): string => `${userId}:${threadId}`;

export function oweWhatsappReply(
  userId: number,
  threadId: number,
  phone: string,
  now: number = Date.now(),
): void {
  owedReplies.set(owedKey(userId, threadId), { phone, until: now + OWED_REPLY_TTL_MS });
}

export function forgetOwedWhatsappReply(userId: number, threadId: number): void {
  owedReplies.delete(owedKey(userId, threadId));
}

/** The text the person reads, with the choices numbered when they cannot be buttons. */
export function replyText(reply: string, choices: readonly string[], asButtons: boolean): string {
  if (asButtons || choices.length === 0) return reply;
  const listed = choices
    .slice(0, MAX_NUMBERED_CHOICES)
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n');
  return `${reply}\n\n${listed}`;
}

/** A bare number answers the choices last offered to the person, as tapping it in the app would. */
export function choiceByNumber(userId: number, text: string): string {
  const n = /^\s*(\d{1,2})\s*\.?\s*$/u.exec(text);
  const choices = lastChoices.get(userId);
  if (n === null || choices === undefined) return text;
  return choices[Number(n[1]) - 1] ?? text;
}

/**
 * Called when a run in a conversation ends: if the person asked it from
 * WhatsApp, the answer goes back there, once. Never throws.
 */
export async function deliverOwedWhatsappReply(
  userId: number,
  threadId: number,
  reply: string,
  choices: readonly string[] = [],
  now: number = Date.now(),
): Promise<void> {
  const key = owedKey(userId, threadId);
  const owed = owedReplies.get(key);
  if (owed === undefined) return;
  owedReplies.delete(key);
  if (owed.until < now || reply.trim() === '') return;
  try {
    const buttons = asReplyButtons(choices);
    lastChoices.set(userId, choices);
    await replyInWhatsapp(
      userId,
      owed.phone,
      replyText(reply, choices, buttons !== null),
      threadId,
      buttons,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[whatsapp] reply to ${userId} not sent:`, (err as Error).message);
  }
}
