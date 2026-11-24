import { showTyping } from './whatsappChannel.service';
import { whatsappReplyOwed } from './whatsappReplies.service';

/**
 * Misho, 24 Nov: the dots stay while the answer is being written. WhatsApp
 * shows them for 25 seconds at most, and an answer — a search above all —
 * takes longer, so they are shown again every 20 seconds until the answer the
 * line is owed has gone out, for at most five minutes.
 */
export const TYPING_REFRESH_MS = 20_000;
export const TYPING_MAX_MS = 5 * 60_000;

const typing = new Map<string, NodeJS.Timeout>();
const keyOf = (userId: number, threadId: number): string => `${userId}:${threadId}`;

/** Stops the dots for this conversation, if they are running. */
export function stopTyping(userId: number, threadId: number): void {
  const key = keyOf(userId, threadId);
  const timer = typing.get(key);
  if (timer !== undefined) clearInterval(timer);
  typing.delete(key);
}

/** Shows the dots on the person's line now and keeps them while its answer is owed. */
export function keepTyping(
  userId: number,
  threadId: number,
  wamid: string,
  now: () => number = Date.now,
): void {
  stopTyping(userId, threadId);
  if (wamid === '') return;
  void showTyping(wamid);
  const until = now() + TYPING_MAX_MS;
  const timer = setInterval(() => {
    if (now() >= until || !whatsappReplyOwed(userId, threadId, now())) {
      stopTyping(userId, threadId);
      return;
    }
    void showTyping(wamid);
  }, TYPING_REFRESH_MS);
  timer.unref();
  typing.set(keyOf(userId, threadId), timer);
}
