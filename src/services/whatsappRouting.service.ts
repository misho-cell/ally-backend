import { QUICK_MODEL, noThinkingFor } from './aiModels';
import { recordClaudeUsage } from './costLedger.service';
import { getOpenTaskByThread } from './taskStore.service';
import { createThread } from './threads.service';
import { labelWhatsappThread } from './whatsappReplies.service';

/**
 * Misho, 21 Nov: WhatsApp is ONE chat, and every unquoted line went into the
 * conversation we last wrote about. His held a goal opened in October, so each
 * new request he typed („a football coach in Didube", „white-frame flats from
 * developers") met „one conversation, one goal": the new goal was refused, the
 * full research never started, and only the quick answer came. A new request
 * now gets a conversation of its own, as a new chat in the app does; a line that
 * goes on with the goal, or is just talk, stays where it was.
 */
export enum LineKind {
  NewRequest = 'new_request',
  SameGoal = 'same_goal',
  Talk = 'talk',
}

const ROUTER_MODEL = process.env.WHATSAPP_ROUTER_MODEL?.trim() || QUICK_MODEL;
const ROUTER_TIMEOUT_MS = 4_000;
const ROUTER_MAX_TOKENS = 20;
const MAX_LINE_CHARS = 1_500;
const MAX_TITLE_CHARS = 200;
const USAGE_KIND = 'whatsapp_routing';

const ROUTER_PROMPT =
  'A person writes to their assistant in one WhatsApp chat. They have ONE open goal, named ' +
  'below. Decide what their new line is. new_request: they ask for something the goal is not ' +
  'about (a different person, service, product or task to find or do). same_goal: it goes on ' +
  'with that goal (an answer, a change, „ask him too", a question about how it stands). talk: ' +
  'a greeting, thanks, or a question about the assistant itself. Answer with one word: ' +
  'new_request, same_goal or talk.';

/** Pure: the model's word, or SameGoal when it says nothing usable — staying put is the old behaviour. */
export function lineKindFrom(answer: string): LineKind {
  const word = answer.trim().toLowerCase();
  if (word.includes(LineKind.NewRequest)) return LineKind.NewRequest;
  if (word.includes(LineKind.Talk)) return LineKind.Talk;
  return LineKind.SameGoal;
}

/** Pure: what the small model reads. */
export function routerInput(goalTitle: string, line: string): string {
  return `OPEN GOAL: ${goalTitle.slice(0, MAX_TITLE_CHARS)}\n\nNEW LINE: ${line.slice(0, MAX_LINE_CHARS)}`;
}

async function readLineKind(
  userId: number,
  threadId: number,
  goalTitle: string,
  line: string,
): Promise<LineKind> {
  const { default: anthropic } = await import('../config/anthropic');
  const response = await anthropic.messages.create(
    {
      model: ROUTER_MODEL,
      ...noThinkingFor(ROUTER_MODEL),
      max_tokens: ROUTER_MAX_TOKENS,
      system: ROUTER_PROMPT,
      messages: [{ role: 'user', content: routerInput(goalTitle, line) }],
    },
    { timeout: ROUTER_TIMEOUT_MS },
  );
  await recordClaudeUsage({
    userId: String(userId),
    kind: USAGE_KIND,
    model: ROUTER_MODEL,
    usage: response.usage,
    threadId,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[whatsapp-routing] usage not recorded:', (err as Error).message);
  });
  const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return lineKindFrom(text);
}

/**
 * The conversation an unquoted WhatsApp line goes to: a new one when the line is
 * a new request and the current one already holds a goal, else the current one.
 * Never throws; any failure keeps the line where it was.
 */
export async function conversationForLine(
  userId: number,
  threadId: number,
  line: string,
): Promise<number> {
  if (line.trim() === '') return threadId;
  try {
    const goal = await getOpenTaskByThread(threadId);
    if (goal === null) return threadId;
    const kind = await readLineKind(userId, threadId, goal.title, line);
    if (kind !== LineKind.NewRequest) {
      labelWhatsappThread(threadId, goal.title);
      return threadId;
    }
    const fresh = await createThread(String(userId), 'regular');
    // eslint-disable-next-line no-console
    console.info(`[whatsapp-routing] new request: thread ${threadId} → ${fresh.id}`);
    return fresh.id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp-routing] line kept in its conversation:', (err as Error).message);
    return threadId;
  }
}
