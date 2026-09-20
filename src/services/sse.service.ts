import { EventEmitter } from 'events';
import { Response } from 'express';
import {
  scrubDeep,
  scrubText,
  stripAllowedSpans,
  informalGeorgianForDisplay,
  stripEmDashesForDisplay,
  stripRedactionArtifactsForDisplay,
} from './privacyScrub';

// Scrub then reveal explicitly-allowed spans (the own-number passthrough) at
// this final display boundary; the "[hidden]" placeholder itself never renders.
function displayText(text: string): string {
  return informalGeorgianForDisplay(
    stripEmDashesForDisplay(stripRedactionArtifactsForDisplay(stripAllowedSpans(scrubText(text)))),
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
 * Every event carries an id, and a short tail of them is kept so a stream that
 * drops can pick up where it left off.
 *
 * WHY. Three reports in one evening of the same shape: the answer is in the
 * thread, the open page does not have it, a reload shows it at once. Thread
 * 16907 on 17 September is the clean one — run df94d79b finished at 19:29:14,
 * was never dropped, and the route reached emitRunComplete; the page still
 * read „working" a minute and a half later.
 *
 * This is why it can happen at all: an event was written to whatever sockets
 * happened to be open at that instant and then forgotten. No ids, no buffer,
 * nothing to ask for. A phone that slept through the reply, a tunnel that
 * blinked, a proxy that recycled the connection — each loses the answer
 * permanently, and the person is left looking at a spinner over a thread that
 * has their answer in it.
 *
 * The fix is the one the protocol already specifies. Each event is written
 * with an `id:` line; a browser's EventSource remembers the last id it saw and
 * sends it back as `Last-Event-ID` when it reconnects by itself, with no
 * frontend change at all. On connect we replay what it missed.
 *
 * Replay cannot duplicate: Last-Event-ID is the last id the client RECEIVED,
 * and only ids strictly after it are sent. A fresh page load has no id and
 * gets nothing, which is right — it loads the thread from the database.
 */
interface BufferedEvent {
  readonly id: number;
  readonly data: unknown;
  readonly at: number;
}

/**
 * Event ids are anchored to the clock, and that is a correctness property
 * rather than a convenience.
 *
 * WHAT WAS WRONG. The counter started at 0 in every process, so ids restarted
 * at 1 on every deploy and every crash. Two things follow, and the second is
 * the bad one:
 *
 *   1. The buffer a reconnect reads from dies with the process, so the one
 *      reconnect that is GUARANTEED to happen — the one a deploy causes — is
 *      the one replay can never serve. That is a limit, not a bug.
 *   2. The next process then issues ids the client has ALREADY SEEN. This
 *      module's own argument for why replay cannot duplicate is that „a client
 *      skips an id it has already seen". If a client does that, then after a
 *      restart every new event carries a stale-looking id and is dropped
 *      silently, until the fresh counter climbs back past the old high-water
 *      mark — minutes or hours later. The page sits on a live socket receiving
 *      events and rendering none of them, and a reload fixes it, because a
 *      reload starts with no id at all.
 *
 * That was not hypothetical arithmetic: the log line „[sse] user 171870
 * resumed at 54" is a real id from a container forty minutes old. Ids were
 * small, they restarted, and they collided across boots.
 *
 * Anchoring the counter to `Date.now()` at load makes an id monotonic across
 * restarts as long as the clock is, and it makes the id SAY which process
 * issued it — which is what `subscribeUserEvents` uses to tell a reconnect
 * within this process from one across a restart. The `Math.max` keeps ids
 * strictly increasing when several are issued inside one millisecond, at the
 * cost of running that many milliseconds ahead of the clock. At this service's
 * rate — single figures per minute — the overshoot is nothing; the test suite,
 * which fires a couple of dozen in a row, reaches seven milliseconds of it and
 * says so in the test. A restart is safe while the overshoot is smaller than
 * the time the process was down, which at these rates it always is.
 */
const PROCESS_EPOCH_ID = Date.now();
let sequence = PROCESS_EPOCH_ID;
const recentByUser = new Map<string, BufferedEvent[]>();

function nextId(): number {
  sequence = Math.max(sequence + 1, Date.now());
  return sequence;
}

/**
 * Deliberately small. This buffer exists to cover a reconnect measured in
 * seconds, not to be a mailbox: anything older than the window is in the
 * database, which is where a client that has been away that long should read
 * it from.
 */
const REPLAY_BUFFER_PER_USER = 60;
const REPLAY_TTL_MS = 5 * 60_000;

function publish(userId: string, data: Record<string, unknown>): void {
  const event: BufferedEvent = { id: nextId(), data, at: Date.now() };
  const held = recentByUser.get(userId) ?? [];
  held.push(event);
  const cutoff = Date.now() - REPLAY_TTL_MS;
  const kept = held.filter((e) => e.at >= cutoff).slice(-REPLAY_BUFFER_PER_USER);
  recentByUser.set(userId, kept);
  emitter.emit(`user:${userId}`, event);
}

/** What a reconnecting stream missed, oldest first. */
function eventsSince(userId: string, lastEventId: number): readonly BufferedEvent[] {
  const cutoff = Date.now() - REPLAY_TTL_MS;
  return (recentByUser.get(userId) ?? []).filter((e) => e.id > lastEventId && e.at >= cutoff);
}

/**
 * Drop a user's tail once nothing of theirs is connected and it has aged out.
 * Called from the keepalive rather than a timer of its own: a map that only
 * ever grows is the kind of leak that shows up as a restart three weeks later.
 */
function pruneIdleBuffers(): void {
  const cutoff = Date.now() - REPLAY_TTL_MS;
  for (const [userId, held] of recentByUser) {
    const kept = held.filter((e) => e.at >= cutoff);
    if (kept.length === 0) recentByUser.delete(userId);
    else recentByUser.set(userId, kept);
  }
}

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
  /** The browser's own `Last-Event-ID` header, when it is reconnecting. */
  lastEventId?: string | null,
): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepalive = setInterval(() => {
    res.write(': ping\n\n');
    pruneIdleBuffers();
  }, KEEPALIVE_INTERVAL_MS);

  const eventName = `user:${userId}`;
  const key = device ?? null;

  /**
   * `data:` FIRST, `id:` after it, and the order is a compatibility decision
   * rather than a style one.
   *
   * This stream is behind `Authorization: Bearer`, which a browser's native
   * EventSource cannot send — so the client is a polyfill or a hand-rolled
   * reader over fetch, and I cannot see which. A hand-rolled one very
   * plausibly does `chunk.startsWith('data: ')`; the test harness in this
   * repo did exactly that until this change, which is the best evidence
   * available of how somebody writes this by hand.
   *
   * The SSE grammar takes the fields of an event block in any order and
   * dispatches at the blank line, so putting data first costs nothing and
   * leaves a naive parser reading exactly what it read yesterday. The harness
   * is deliberately left naive for the same reason: if anyone reorders these
   * two lines, that test is what says so.
   */
  function write(event: BufferedEvent): void {
    res.write(`data: ${JSON.stringify(event.data)}\nid: ${event.id}\n\n`);
  }

  emitter.on(eventName, write);
  openConnection(userId, key);

  /**
   * Whatever this stream missed while it was away, before anything new.
   *
   * After the listener is attached, never before: a gap between the replay and
   * the subscription is the same hole this exists to close, one event wide.
   * An event arriving in between is written twice — harmless, because a client
   * skips an id it has already seen, and the alternative is losing it.
   *
   * A header that is not a number is treated as no header. Nothing about it
   * reaches a query or a file; it only chooses where in our own buffer to
   * start, and the buffer holds only what we put there.
   */
  const resumeFrom = Number.parseInt(lastEventId ?? '', 10);
  if (Number.isFinite(resumeFrom) && resumeFrom > 0) {
    /**
     * An id below this process's epoch was issued by a PREVIOUS process, and
     * nothing in this one's memory can catch that client up: the buffer it
     * would have been served from went with the old container. Saying so is
     * the only honest answer, and it is a better one than silence — silence
     * here is a page that waits forever for events it already missed.
     *
     * The frame carries a live id, so the client's resume point moves into
     * this process's range and the next reconnect is an ordinary one. It is
     * written to this stream alone rather than published: it is a fact about
     * one socket, not an event in the user's timeline, and every other device
     * has its own answer to the same question.
     */
    const acrossRestart = resumeFrom < PROCESS_EPOCH_ID;
    if (acrossRestart) {
      res.write(
        `data: ${JSON.stringify({ event: 'stream_reset', reason: 'server_restarted' })}\nid: ${nextId()}\n\n`,
      );
    }
    const missed = eventsSince(userId, resumeFrom);
    // eslint-disable-next-line no-console
    console.log(
      `[sse] user ${userId} resumed at ${resumeFrom}: ${missed.length} event(s) replayed` +
        (acrossRestart ? ' — ACROSS A RESTART, told to refetch' : ''),
    );
    for (const event of missed) write(event);
  } else {
    /**
     * A CONNECT THAT CARRIES NO ID IS LOGGED TOO, and it is the more
     * interesting of the two.
     *
     * The line above has always existed and the silent case never did, so the
     * log could show a resume and could not show its absence. That is the
     * whole question behind the seat's intermittent: the client is
     * `fetch-event-source`, which sends `last-event-id` when IT reconnects —
     * but an app that remounts the stream builds fresh headers and sends none,
     * and the comment above („a fresh page load … loads the thread from the
     * database") is true of a page LOAD and false of a remount, which reloads
     * nothing. Everything published while that socket was down is then gone
     * with no trace, on a connection that looks perfectly healthy.
     *
     * One line per connect, so the next occurrence can be read off the server
     * instead of asked for.
     */
    // eslint-disable-next-line no-console
    console.log(
      `[sse] user ${userId} connected with NO last-event-id` +
        (lastEventId === null || lastEventId === undefined
          ? ''
          : ` (header present but unusable: ${JSON.stringify(lastEventId).slice(0, 40)})`),
    );
  }

  let closed = false;
  return (): void => {
    // Guarded: 'close' can fire more than once, and a double decrement would
    // make a device that is still watching look away.
    if (closed) return;
    closed = true;
    clearInterval(keepalive);
    emitter.off(eventName, write);
    closeConnection(userId, key);
  };
}

export function emitThreadCreated(userId: string, thread: unknown): void {
  publish(userId, { event: 'thread_created', thread });
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
/**
 * Ticket 20 row 113 — the buttons a stopped goal left on the screen.
 *
 * Read by the tester on thread 16798: the stop line was written and the plan's
 * „დამტკიცებულია" / „შევცვალოთ" stayed under it until they reloaded the page.
 * The stored row was correct — the buttons live on the message above, which
 * nothing touched — so the screen was showing a live approve button for a goal
 * that had just been stopped, and a tap would have approved a plan for a
 * closed goal.
 *
 * The event carries no payload beyond the thread: the client's job is to clear
 * the choices it is currently showing, and anything more specific would be the
 * server guessing at the client's state.
 */
export function emitChoicesCleared(userId: string, threadId: number): void {
  publish(userId, { event: 'choices_cleared', threadId });
}

export function emitThreadUpdated(userId: string, thread: ThreadUpdatePayload): void {
  publish(userId, {
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
  publish(userId, {
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
  publish(userId, {
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
  publish(userId, {
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
  publish(userId, { event: 'answer_reset', threadId, runId });
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
  publish(userId, { event: 'run_complete', threadId, runId, ...safe });
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
  publish(userId, {
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
  publish(userId, { event: 'tokens_debited', threadId, runId, tokens });
}

/** A run failed before producing an answer. */
export function emitRunError(
  userId: string,
  threadId: number,
  runId: string,
  message: string,
): void {
  publish(userId, { event: 'run_error', threadId, runId, message });
}
