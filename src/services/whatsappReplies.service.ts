import { asReplyButtons, replyInWhatsapp, tellInWhatsapp } from './whatsappChannel.service';
import { boldNamesFor, withBoldNames, withNextStepBold } from './whatsappBold';

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
  /** #8748: the server's own cards this run wrote, sent under the answer. */
  readonly cards: string[];
}
const owedReplies = new Map<string, OwedReply>();
/**
 * Misho, 21 Nov: the full research's second answer never reached WhatsApp — a
 * line is owed ONE reply, and the quick answer took it. A conversation asked
 * from WhatsApp is remembered for a while, so the second answer is owed too.
 */
const ASKED_FROM_WHATSAPP_MS = 90 * 60_000;
const SECOND_ANSWER_TTL_MS = 45 * 60_000;
const askedFromWhatsapp = new Map<string, { readonly phone: string; readonly until: number }>();
/** The goal each conversation is about, so one WhatsApp chat says which goal an answer is for. */
const threadLabels = new Map<number, string>();
/** The choices last offered, so a typed „2" means the second one. */
const lastChoices = new Map<number, readonly string[]>();

const owedKey = (userId: number, threadId: number): string => `${userId}:${threadId}`;

export function oweWhatsappReply(
  userId: number,
  threadId: number,
  phone: string,
  now: number = Date.now(),
): void {
  owedReplies.set(owedKey(userId, threadId), {
    phone,
    until: now + OWED_REPLY_TTL_MS,
    cards: [],
  });
  askedFromWhatsapp.set(owedKey(userId, threadId), { phone, until: now + ASKED_FROM_WHATSAPP_MS });
}

/** The full research landed: its answer goes to WhatsApp too, when the line came from there. */
export function oweSecondWhatsappReply(
  userId: number,
  threadId: number,
  now: number = Date.now(),
): boolean {
  const asked = askedFromWhatsapp.get(owedKey(userId, threadId));
  if (asked === undefined || asked.until < now) return false;
  owedReplies.set(owedKey(userId, threadId), {
    phone: asked.phone,
    until: now + SECOND_ANSWER_TTL_MS,
    cards: [],
  });
  return true;
}

/** Whether an answer asked from WhatsApp waits for this conversation's next run. */
export function whatsappReplyOwed(
  userId: number,
  threadId: number,
  now: number = Date.now(),
): boolean {
  const owed = owedReplies.get(owedKey(userId, threadId));
  return owed !== undefined && owed.until >= now;
}

/**
 * Misho, 21 Nov: news on a goal (a helper answered, a step came back) reaches
 * WhatsApp as the goal's own words under its name — never as the
 * „დავალებაზე სიახლეა" notice. Worth a paid template outside the 24-hour
 * window, like the notice was. Never throws.
 */
export async function sendGoalNewsToWhatsapp(
  userId: number,
  threadId: number,
  reply: string,
  goalTitle: string | null,
): Promise<void> {
  if (reply.trim() === '') return;
  try {
    await tellInWhatsapp(
      userId,
      labelled(
        withBoldNames(
          withCards(withNextStepBold(reply.trim()), takeNewsCards(userId, threadId)),
          boldNamesFor(userId, threadId),
        ),
        goalTitle?.trim() || undefined,
      ),
      threadId,
      true,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[whatsapp] goal news for ${userId} not sent:`, (err as Error).message);
  }
}

/** Names the goal a conversation is about; its WhatsApp answers carry the name on top. */
export function labelWhatsappThread(threadId: number, goalTitle: string): void {
  const label = goalTitle.trim();
  if (label === '') threadLabels.delete(threadId);
  else threadLabels.set(threadId, label);
}

/** Pure: the answer under its goal's name, so one chat can hold several goals. */
export function labelled(text: string, label: string | undefined): string {
  return label === undefined || label === '' ? text : `${label}\n${text}`;
}

/**
 * #8748 („13 unanswered questions + 1 introduction" on WhatsApp, 6 in the app):
 * the server's cards of what waits went to the app thread only, so on WhatsApp
 * the model counted by itself. A run asked from WhatsApp now sends them there
 * too, as text under its answer. False when no answer is owed there.
 */
/**
 * Misho, 24 Nov (the app is retired): a card from a run nobody typed — a goal's
 * own wake — went to the app only: no answer was owed in WhatsApp. It waits
 * here for that run's news to WhatsApp and goes under it, as the owed answer's
 * cards do. A card whose run sends no news within the window is not sent.
 */
const NEWS_CARD_TTL_MS = 10 * 60_000;
const newsCards = new Map<string, { cards: string[]; until: number }>();

export function holdCardForNews(
  userId: number,
  threadId: number,
  text: string,
  now: number = Date.now(),
): void {
  if (text.trim() === '') return;
  const key = owedKey(userId, threadId);
  const held = newsCards.get(key);
  const cards = held !== undefined && held.until >= now ? held.cards : [];
  newsCards.set(key, { cards: [...cards, text.trim()], until: now + NEWS_CARD_TTL_MS });
}

/** The cards waiting for this conversation's news, once; none when they went stale. */
export function takeNewsCards(
  userId: number,
  threadId: number,
  now: number = Date.now(),
): string[] {
  const key = owedKey(userId, threadId);
  const held = newsCards.get(key);
  newsCards.delete(key);
  return held === undefined || held.until < now ? [] : held.cards;
}

export function addCardToOwedReply(userId: number, threadId: number, text: string): boolean {
  const owed = owedReplies.get(owedKey(userId, threadId));
  if (owed === undefined || text.trim() === '') return false;
  owed.cards.push(text.trim());
  return true;
}

/** The answer, its choices, then the server's cards, each its own paragraph. */
export function withCards(text: string, cards: readonly string[]): string {
  return [text, ...cards].join('\n\n');
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
      labelled(
        withBoldNames(
          withCards(replyText(withNextStepBold(reply), choices, buttons !== null), owed.cards),
          boldNamesFor(userId, threadId),
        ),
        threadLabels.get(threadId),
      ),
      threadId,
      buttons,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[whatsapp] reply to ${userId} not sent:`, (err as Error).message);
  }
}
