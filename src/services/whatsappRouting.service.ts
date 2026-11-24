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
 *
 * Alert 859 (23 Nov) and a second member on 24 Nov: the router read only the
 * goal's title — one was a sentence the member typed („we talked about this
 * before, start over") — and never what the member had just been shown. So a
 * reminder on the goal, an answer to the run's own question and „the goals
 * later, find the B2B person first" each opened a new conversation and a
 * duplicate goal. It now reads the goal's own request and the last lines the
 * member saw; a line answering those stays where it is.
 */
export enum LineKind {
  NewRequest = 'new_request',
  SameGoal = 'same_goal',
  Talk = 'talk',
  /** Misho, 24 Nov: „when it is not sure whether this is the old goal or a new one, ask". */
  Unsure = 'unsure',
}

const ROUTER_MODEL = process.env.WHATSAPP_ROUTER_MODEL?.trim() || QUICK_MODEL;
const ROUTER_TIMEOUT_MS = 4_000;
const ROUTER_MAX_TOKENS = 20;
const MAX_LINE_CHARS = 1_500;
const USAGE_KIND = 'whatsapp_routing';

const ROUTER_PROMPT =
  'A person writes to their assistant in one WhatsApp chat. They have ONE open goal, described ' +
  'below, and LAST SHOWN is what the assistant last wrote to them there. Decide what their new ' +
  'line is. Judge by WHAT is needed, never by WHO is named: the goal may name a person they ' +
  'want to ask, and the same person asked about a different need is a new request. ' +
  'new_request: they need something the goal is not about and LAST SHOWN is not about either ' +
  '(a different service, product, specialist or task to find or do). same_goal: it goes on ' +
  'with that same need, or answers or reacts to LAST SHOWN (a reply to its question, a choice, ' +
  'a correction, „later", „first do X" about what it offered), or asks to remind, nudge or ' +
  'follow up with someone about it, or asks how it stands. talk: a greeting, thanks, or a ' +
  'question about the assistant itself. unsure: the line could as well be about the goal or ' +
  'LAST SHOWN as a different need, and nothing in them settles which — the person will be ' +
  'asked. Answer with one word: new_request, same_goal, talk or unsure.';
/** The goal as the router reads it, at most this long. */
const MAX_GOAL_CHARS = 600;
/** What the member was last shown, at most this long. */
const MAX_SHOWN_CHARS = 1_200;
/** The last lines read: an answer and the card under it. */
const LAST_LINES_READ = 2;
/** The kinds of row a member reads as the assistant's words; progress captions are not. */
const SHOWN_KINDS = ['message', 'pending'];

/** Pure: the model's word, or SameGoal when it says nothing usable — staying put is the old behaviour. */
export function lineKindFrom(answer: string): LineKind {
  const word = answer.trim().toLowerCase();
  if (word.includes(LineKind.NewRequest)) return LineKind.NewRequest;
  if (word.includes(LineKind.Unsure)) return LineKind.Unsure;
  if (word.includes(LineKind.Talk)) return LineKind.Talk;
  return LineKind.SameGoal;
}

/** Pure: what the small model reads. */
export function routerInput(goal: string, line: string, lastShown = ''): string {
  const shown =
    lastShown.trim() === '' ? '' : `\n\nLAST SHOWN: ${lastShown.slice(-MAX_SHOWN_CHARS)}`;
  return `OPEN GOAL: ${goal.slice(0, MAX_GOAL_CHARS)}${shown}\n\nNEW LINE: ${line.slice(0, MAX_LINE_CHARS)}`;
}

/** Pure: the goal as its own words say it — the brief, else what was asked, else the title. */
export function goalText(goal: {
  readonly title: string;
  readonly description?: string | null;
  readonly brief?: string | null;
}): string {
  const said = [goal.brief, goal.description].find((t) => typeof t === 'string' && t.trim() !== '');
  return (said ?? goal.title).trim().slice(0, MAX_GOAL_CHARS);
}

/** A goal's name in a question: its brief's first sentence, else its title. */
const MAX_GOAL_NAME_CHARS = 70;
const BRIEF_LEAD = /^\s*(მიზანი|goal)\s*:\s*/iu;

/** Pure: the goal as a short name the person recognises. */
export function goalName(goal: { readonly title: string; readonly brief?: string | null }): string {
  const brief = typeof goal.brief === 'string' ? goal.brief.replace(BRIEF_LEAD, '').trim() : '';
  const first =
    brief
      .split(/(?<=[.!?])\s/u)[0]
      ?.replace(/[.!?]$/u, '')
      .trim() ?? '';
  const name = first !== '' ? first : goal.title.trim();
  return name.length > MAX_GOAL_NAME_CHARS ? `${name.slice(0, MAX_GOAL_NAME_CHARS)}…` : name;
}

/** The assistant's last lines in this conversation, oldest first; empty when unread. */
export async function lastLinesShown(threadId: number): Promise<string> {
  try {
    const result = await query<{ content: string | null }>(
      `SELECT content FROM conversations
        WHERE thread_id = $1 AND role = 'assistant' AND kind = ANY($2::text[])
          AND COALESCE(content, '') <> ''
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [threadId, SHOWN_KINDS, LAST_LINES_READ],
      QUERY_TIMEOUT_MS,
    );
    return result.rows
      .map((row) => row.content ?? '')
      .reverse()
      .join('\n\n');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[whatsapp-routing] last lines not read:', (err as Error).message);
    return '';
  }
}

async function readLineKind(
  userId: number,
  threadId: number,
  goal: string,
  line: string,
  lastShown: string,
): Promise<LineKind> {
  const { default: anthropic } = await import('../config/anthropic');
  const response = await anthropic.messages.create(
    {
      model: ROUTER_MODEL,
      ...noThinkingFor(ROUTER_MODEL),
      max_tokens: ROUTER_MAX_TOKENS,
      system: ROUTER_PROMPT,
      messages: [{ role: 'user', content: routerInput(goal, line, lastShown) }],
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

/** Where an unquoted WhatsApp line goes. */
export enum RouteKind {
  /** The conversation it came to. */
  Stay = 'stay',
  /** A new conversation, opened for it. */
  New = 'new',
  /** Not sure: the person is asked which, and the line waits for the answer. */
  Ask = 'ask',
}

export interface LineRoute {
  readonly kind: RouteKind;
  readonly threadId: number;
  /** With Ask: the open goal, as the question names it. */
  readonly goal?: string;
}

/** Opens a conversation for a new request. */
export async function newConversationFor(userId: number, from: number): Promise<number> {
  const fresh = await createThread(String(userId), 'regular');
  // eslint-disable-next-line no-console
  console.info(`[whatsapp-routing] new request: thread ${from} → ${fresh.id}`);
  return fresh.id;
}

/**
 * Where an unquoted WhatsApp line goes: a new conversation when it is a new
 * request beside a goal, a question to the person when the router cannot
 * tell, else where it came. Never throws; any failure keeps the line put.
 */
export async function routeLine(
  userId: number,
  threadId: number,
  line: string,
): Promise<LineRoute> {
  const stay = { kind: RouteKind.Stay, threadId };
  if (line.trim() === '') return stay;
  try {
    const goal = await getOpenTaskByThread(threadId);
    if (goal === null) return stay;
    const lastShown = await lastLinesShown(threadId);
    const kind = await readLineKind(userId, threadId, goalText(goal), line, lastShown);
    if (kind === LineKind.Unsure) {
      // eslint-disable-next-line no-console
      console.info(`[whatsapp-routing] unsure: thread ${threadId}, asking which`);
      return { kind: RouteKind.Ask, threadId, goal: goalName(goal) };
    }
    if (kind !== LineKind.NewRequest) {
      labelWhatsappThread(threadId, goal.title);
      return stay;
    }
    return { kind: RouteKind.New, threadId: await newConversationFor(userId, threadId) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp-routing] line kept in its conversation:', (err as Error).message);
    return stay;
  }
}

/** The conversation for a line, asking nobody: an unsure line stays where it came. */
export async function conversationForLine(
  userId: number,
  threadId: number,
  line: string,
): Promise<number> {
  return (await routeLine(userId, threadId, line)).threadId;
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
