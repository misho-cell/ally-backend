import { EventEmitter } from 'events';
import { Response } from 'express';
import {
  scrubDeep,
  scrubText,
  stripAllowedSpans,
  stripEmDashesForDisplay,
  stripRedactionArtifactsForDisplay,
} from './privacyScrub';

// Scrub then reveal explicitly-allowed spans (the own-number passthrough) at
// this final display boundary; the "[hidden]" placeholder itself never renders.
function displayText(text: string): string {
  return stripEmDashesForDisplay(
    stripRedactionArtifactsForDisplay(stripAllowedSpans(scrubText(text))),
  );
}

/**
 * The same treatment, for a value that is STORED and later served by a route
 * that does not pass through here.
 *
 * Ticket 17 Task 39: `share_text` reaches the client two ways — this event on
 * a live run, and the stored row after a reload. The event scrubbed it and the
 * row did not, so the two agreed only because the copy happened to contain
 * nothing the scrub touches. That is agreement by luck, and the wording is
 * explicitly the founder's to change with one line — after which the share
 * sheet would have sent different text depending on whether the user had
 * reloaded. Scrubbing once at the source makes them the same by construction;
 * every step here is idempotent, so passing through the event again is a no-op.
 */
export function toDisplayText(text: string): string {
  return displayText(text);
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const KEEPALIVE_INTERVAL_MS = 30_000;

/**
 * Ticket 17 row 6: which of a person's DEVICES is watching right now.
 *
 * The bug this exists for. Presence was one boolean per person, and the push
 * was skipped whenever that boolean was true. Lika has four subscriptions; with
 * a Mac tab open, her phone was told nothing — because the Mac was connected.
 * That is precisely the reported symptom: „it arrives on the desktop, not on
 * the phone." The phone was never away from our point of view, because we were
 * never looking at the phone.
 *
 * So presence is counted per device. Nested map rather than a flat key, because
 * the question asked of it is always „which of THIS user's devices are here".
 * Counted, not a flag: one device can hold two streams (two tabs), and the
 * first one closing must not make the device look absent.
 */
const connections = new Map<string, Map<string | null, number>>();

/** Long enough for any real user-agent; a guard against an absurd one. */
const MAX_DEVICE_KEY_CHARS = 400;

/**
 * One device, named the same way on both sides — the stream that arrives and
 * the push subscription that was stored — so the two can be compared at all.
 *
 * Candidates in order of how much they are believed, first usable one wins.
 * A device_id is the frontend saying so explicitly, and it survives the browser
 * update that rewrites a user-agent string. The user-agent is the fallback that
 * needs nothing from anyone: the same browser writes it in both places. It does
 * not tell two identical iPhones apart, and it does not have to — it tells a
 * Mac from a phone, which is row 6.
 */
export function deviceKey(...candidates: (string | null | undefined)[]): string | null {
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (cleaned !== '') return cleaned.slice(0, MAX_DEVICE_KEY_CHARS);
  }
  return null;
}

function openConnection(userId: string, key: string | null): void {
  const devices = connections.get(userId) ?? new Map<string | null, number>();
  devices.set(key, (devices.get(key) ?? 0) + 1);
  connections.set(userId, devices);
}

function closeConnection(userId: string, key: string | null): void {
  const devices = connections.get(userId);
  if (devices === undefined) return;
  const left = (devices.get(key) ?? 0) - 1;
  if (left > 0) devices.set(key, left);
  else devices.delete(key);
  if (devices.size === 0) connections.delete(userId);
}

/**
 * The named devices with a stream open right now.
 *
 * Only devices that could be named. A connection whose device we cannot
 * identify is filed under the null key — which no name can ever collide with,
 * where a sentinel string could — and is counted by `hasActiveConnection`
 * alone, so nothing can silently be read as „that device is present".
 */
export function connectedDevices(userId: string): ReadonlySet<string> {
  const devices = connections.get(userId);
  if (devices === undefined) return new Set<string>();
  return new Set([...devices.keys()].filter((k): k is string => k !== null));
}

export function subscribeUserEvents(
  userId: string,
  res: Response,
  device?: string | null,
): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepalive = setInterval(() => {
    res.write(': ping\n\n');
  }, KEEPALIVE_INTERVAL_MS);

  const eventName = `user:${userId}`;
  const key = device ?? null;

  function onEvent(data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  emitter.on(eventName, onEvent);
  openConnection(userId, key);

  let closed = false;
  return (): void => {
    // Guarded: 'close' can fire more than once, and a double decrement would
    // make a device that is still watching look away.
    if (closed) return;
    closed = true;
    clearInterval(keepalive);
    emitter.off(eventName, onEvent);
    closeConnection(userId, key);
  };
}

export function emitThreadCreated(userId: string, thread: unknown): void {
  emitter.emit(`user:${userId}`, { event: 'thread_created', thread });
}

export interface ThreadUpdatePayload {
  id: number;
  status?: string;
  status_line?: string | null;
  is_task?: boolean;
  title?: string;
  // Public ref of the linked introduction request — included on request-thread
  // updates so the client can target /requests/:ref without a refetch.
  request_ref?: string;
}

/**
 * The thread's task state (or generated title) changed server-side — every
 * connected device patches its chat list from this instead of deriving state
 * locally. Fields are partial: only what changed is sent.
 */
export function emitThreadUpdated(userId: string, thread: ThreadUpdatePayload): void {
  emitter.emit(`user:${userId}`, {
    event: 'thread_updated',
    thread: {
      ...thread,
      ...(typeof thread.status_line === 'string' && { status_line: scrubText(thread.status_line) }),
      ...(typeof thread.title === 'string' && { title: scrubText(thread.title) }),
    },
  });
}

/**
 * Whether the user has ANY stream open, on any device.
 *
 * Still the right question for one case only: a push subscription that cannot
 * name its device. There is nothing to compare it against, so it keeps the old
 * rule — somebody is here, do not interrupt them. Every subscription that CAN
 * name its device is decided by `connectedDevices` instead.
 */
export function hasActiveConnection(userId: string): boolean {
  return (connections.get(userId)?.size ?? 0) > 0;
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
    text: displayText(text),
  });
}

/**
 * An incremental chunk of the final answer as it streams from the model, so the
 * UI fills in progressively instead of blanking for the whole generation. The
 * chunk is append-only and already phone-scrubbed; run_complete still carries the
 * full authoritative reply, which the client reconciles the buffer against.
 */
export function emitAnswerDelta(
  userId: string,
  threadId: number,
  runId: string,
  delta: string,
): void {
  emitter.emit(`user:${userId}`, {
    event: 'answer_delta',
    threadId,
    runId,
    delta: displayText(delta),
  });
}

/**
 * The text streamed so far this run turned out to be tool-round narration, not
 * the final answer — the client must clear its delta buffer for this run. Fired
 * between turns; the deltas that follow start a fresh answer. Fixes narration
 * garbling into the visible message mid-run.
 */
export function emitAnswerReset(userId: string, threadId: number, runId: string): void {
  emitter.emit(`user:${userId}`, { event: 'answer_reset', threadId, runId });
}

interface RunCompletePayload {
  reply: string;
  options?: unknown;
  choices?: unknown;
  // Structured task outcome (who/when/where/topic) the model filled via
  // set_task_result — the client renders it as a result card.
  result?: unknown;
  /**
   * Ticket 17 Task 39: the ready-to-send invitation, verbatim as the tool
   * wrote it, when `get_invite_link` ran during this turn. The share button
   * sends THIS. It exists because the frontend was otherwise reduced to
   * picking whichever paragraph of the answer contained a link — which holds
   * only while the model quotes the text whole, and the one message that goes
   * out under a user's own name should not rest on that.
   */
  share_text?: string;
}

/** Final answer for a run — the frontend renders this as the assistant message. */
export function emitRunComplete(
  userId: string,
  threadId: number,
  runId: string,
  payload: RunCompletePayload,
): void {
  const safe: RunCompletePayload = {
    reply: displayText(payload.reply),
    options: scrubDeep(payload.options),
    choices: scrubDeep(payload.choices),
    result: scrubDeep(payload.result),
    // The share text carries the user's OWN invite link and no third party's
    // anything, but it goes through the same scrub as every other field —
    // nothing reaches a client unscrubbed because of what we believe is in it.
    ...(payload.share_text !== undefined && {
      share_text: displayText(payload.share_text),
    }),
  };
  emitter.emit(`user:${userId}`, { event: 'run_complete', threadId, runId, ...safe });
}

export interface AppendedMessagePayload {
  messageId: string;
  kind: 'pending';
  content: string;
  choices: readonly string[];
  ref: Record<string, unknown>;
}

/**
 * Ticket 16 Task 98: a message that is NOT the answer — a waiting request, an
 * old introduction, a follow-up. The client APPENDS it as its own assistant
 * bubble with its own buttons; it never replaces the answer above it. Several
 * may arrive after one run, in order.
 */
export function emitMessageAppended(
  userId: string,
  threadId: number,
  runId: string,
  payload: AppendedMessagePayload,
): void {
  emitter.emit(`user:${userId}`, {
    event: 'message_appended',
    threadId,
    runId,
    messageId: payload.messageId,
    role: 'assistant',
    kind: payload.kind,
    content: displayText(payload.content),
    choices: scrubDeep(payload.choices),
    ref: scrubDeep(payload.ref),
  });
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
