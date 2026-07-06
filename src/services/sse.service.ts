import { EventEmitter } from 'events';
import { Response } from 'express';
import { scrubDeep, scrubText } from './privacyScrub';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const KEEPALIVE_INTERVAL_MS = 30_000;

export function subscribeUserEvents(userId: string, res: Response): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepalive = setInterval(() => {
    res.write(': ping\n\n');
  }, KEEPALIVE_INTERVAL_MS);

  const eventName = `user:${userId}`;

  function onEvent(data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  emitter.on(eventName, onEvent);

  return (): void => {
    clearInterval(keepalive);
    emitter.off(eventName, onEvent);
  };
}

export function emitThreadCreated(userId: string, thread: unknown): void {
  emitter.emit(`user:${userId}`, { event: 'thread_created', thread });
}

// Every text/payload leaving this module is phone-scrubbed here, at the single
// choke point, so a number can never reach the client — not in a spinner line,
// the agent's step narration, or the final answer (the model sometimes writes a
// discovered number into its reasoning; the prompt discourages it but this is
// the guarantee).

/** Short "what I'm doing now" spinner line tied to a specific run. */
export function emitToolProgress(
  userId: string,
  threadId: number,
  runId: string,
  message: string,
): void {
  emitter.emit(`user:${userId}`, {
    event: 'tool_progress',
    threadId,
    runId,
    message: scrubText(message),
  });
}

/** The agent's intermediate natural-language narration between tool calls. */
export function emitStepSummary(
  userId: string,
  threadId: number,
  runId: string,
  text: string,
): void {
  emitter.emit(`user:${userId}`, {
    event: 'step_summary',
    threadId,
    runId,
    text: scrubText(text),
  });
}

interface RunCompletePayload {
  reply: string;
  options?: unknown;
  choices?: unknown;
}

/** Final answer for a run — the frontend renders this as the assistant message. */
export function emitRunComplete(
  userId: string,
  threadId: number,
  runId: string,
  payload: RunCompletePayload,
): void {
  const safe: RunCompletePayload = {
    reply: scrubText(payload.reply),
    options: scrubDeep(payload.options),
    choices: scrubDeep(payload.choices),
  };
  emitter.emit(`user:${userId}`, { event: 'run_complete', threadId, runId, ...safe });
}

/** Tokens charged for a completed run — lets the client refresh the balance live. */
export function emitTokensDebited(
  userId: string,
  threadId: number,
  runId: string,
  tokens: number,
): void {
  emitter.emit(`user:${userId}`, { event: 'tokens_debited', threadId, runId, tokens });
}

/** A run failed before producing an answer. */
export function emitRunError(
  userId: string,
  threadId: number,
  runId: string,
  message: string,
): void {
  emitter.emit(`user:${userId}`, { event: 'run_error', threadId, runId, message });
}
