import { query } from '../db/postgres/client';
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
 *
 * Misho, 21 Nov 18:17Z and 18:29Z: a goal named after the contact to ask
 * („X, renovation") kept a house-architecture request and a teachers request
 * that named the same contact, and both new goals were refused. The router
 * judges by the need, not by the person named.
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
  'below. Decide what their new line is. Judge by WHAT is needed, never by WHO is named: the ' +
  'goal may name a person they want to ask, and the same person asked about a different need ' +
  'is a new request. new_request: they need something the goal is not about (a different ' +
  'service, product, specialist or task to find or do). same_goal: it goes on with that same ' +
  'need (an answer, a change, „ask him too", a question about how it stands). talk: ' +
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

/**
 * Misho, 21 Nov: a question asked of someone reached their WhatsApp, and their
 * answer, typed there without swiping the message, went to a chat of their own —
 * so it never reached him. A line typed soon after we put a question or an
 * introduction request to them goes to that question when it answers it.
 */
const WAITING_QUESTION_HOURS = 24;
const QUERY_TIMEOUT_MS = 4_000;
const ANSWERS = 'answers';

const ANSWER_PROMPT =
  'Someone was asked the QUESTION below in WhatsApp. Their next line is below. Does the line ' +
  'reply to that question (an answer, a name, yes, no, „I do not know", a refusal, a question ' +
  'back about it)? Answer with one word: answers or other.';

export interface WaitingQuestion {
  readonly threadId: number;
  readonly question: string;
}

/** The newest question or introduction request we put to this person in WhatsApp, still open. */
export async function questionAwaitingAnswer(userId: number): Promise<WaitingQuestion | null> {
  const result = await query<{ thread_id: number; question: string | null }>(
    `SELECT m.thread_id, COALESCE(a.question, ir.message) AS question
       FROM whatsapp_messages m
       JOIN threads t ON t.id = m.thread_id AND t.user_id = m.user_id
       LEFT JOIN task_asks a
         ON a.ask_thread_id = t.id AND a.to_user_id = m.user_id AND a.status = 'sent'
       LEFT JOIN introduction_requests ir
         ON ir.id = t.introduction_request_id AND ir.status = 'pending'
      WHERE m.user_id = $1 AND m.direction = 'out'
        AND t.type IN ('incoming_ask', 'incoming_request')
        AND m.created_at > NOW() - make_interval(hours => $2)
        AND (a.id IS NOT NULL OR ir.id IS NOT NULL)
      ORDER BY m.created_at DESC
      LIMIT 1`,
    [userId, WAITING_QUESTION_HOURS],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : { threadId: row.thread_id, question: row.question ?? '' };
}

/** Pure: whether the small model says the line answers the question. */
export function answersFrom(word: string): boolean {
  return word.trim().toLowerCase().startsWith(ANSWERS);
}

async function lineAnswers(
  userId: number,
  waiting: WaitingQuestion,
  line: string,
): Promise<boolean> {
  const { default: anthropic } = await import('../config/anthropic');
  const response = await anthropic.messages.create(
    {
      model: ROUTER_MODEL,
      ...noThinkingFor(ROUTER_MODEL),
      max_tokens: ROUTER_MAX_TOKENS,
      system: ANSWER_PROMPT,
      messages: [
        {
          role: 'user',
          content: `QUESTION: ${waiting.question.slice(0, MAX_LINE_CHARS)}\n\nLINE: ${line.slice(0, MAX_LINE_CHARS)}`,
        },
      ],
    },
    { timeout: ROUTER_TIMEOUT_MS },
  );
  await recordClaudeUsage({
    userId: String(userId),
    kind: USAGE_KIND,
    model: ROUTER_MODEL,
    usage: response.usage,
    threadId: waiting.threadId,
  }).catch(() => undefined);
  return answersFrom(response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
}

/** The question this line answers, or null. Never throws; any failure leaves the line where it was. */
export async function questionThreadForLine(userId: number, line: string): Promise<number | null> {
  if (line.trim() === '') return null;
  try {
    const waiting = await questionAwaitingAnswer(userId);
    if (waiting === null) return null;
    if (!(await lineAnswers(userId, waiting, line))) return null;
    // eslint-disable-next-line no-console
    console.info(`[whatsapp-routing] answer to a question: thread ${waiting.threadId}`);
    return waiting.threadId;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp-routing] waiting question not read:', (err as Error).message);
    return null;
  }
}
