import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { RUN_STRINGS, RunLanguage } from './runLanguage';
import { incomingRequestFollowUp } from './introOpening';
import { emitMessageAppended } from './sse.service';
import { AskScope, findEarlierAskThread } from './threadBackPointer.service';
import { setThreadStatus } from './threadStatus.service';
import {
  outgoingRequestLine,
  RequestOpening,
  saveServerLine,
  ThreadStatus,
  userLanguage,
} from './threads.service';

/**
 * ROW 305 (b) / D530 — A FOLLOW-UP REQUEST CONTINUES THE CONVERSATION.
 *
 * Tornike, deciding what row 305 (a) had left open: „a follow-up introduction
 * request between the same people about the same goal continues their EXISTING
 * conversation."
 *
 * Goal 11323 is the case. Netai Test 65 asked Netai Test 68 about an
 * electrician — ask thread 26997 — and then asked the same person, for the
 * same goal, to introduce the electrician. The request opened 27194 for the
 * mediator and a third thread for the requester, and (a) could only make the
 * threads point at each other.
 *
 * Now, when the ask's conversation is still open, nothing is opened:
 *
 *   the MEDIATOR   gets the request's opening line in the ask thread, which
 *                  goes back to „needs you" and carries the request's ref;
 *   the REQUESTER  gets the „it has gone" line in the goal's own thread, and
 *                  the answer lands there later.
 *
 * Every other request — no goal, no earlier ask, an ask whose conversation has
 * ended, a goal on another thread — is exactly what it was: two threads of its
 * own, and (a)'s pointer lines when there is something to point at.
 */

const SHARED_QUERY_TIMEOUT_MS = 3_000;

/**
 * The switch (migration 189), OFF until the client draws Accept / Decline in an
 * ask thread. Off — or unreadable — means every request opens its own two
 * threads, exactly as before D530.
 */
export const FOLLOW_UP_IN_CONVERSATION_FLAG = 'intro_follow_up_in_conversation';

async function followUpInConversationEnabled(): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
    [FOLLOW_UP_IN_CONVERSATION_FLAG],
    SHARED_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.enabled === true;
}
/** `task_asks.status` of a question the recipient has not answered yet. */
const ASK_STILL_WAITING = 'sent';

/** The two existing threads a follow-up request is written into. */
export interface SharedConversation {
  /** The mediator's ask thread — `introduction_requests.mediator_thread_id`. */
  readonly askThreadId: number;
  /** The requester's goal thread — `introduction_requests.requester_thread_id`. */
  readonly goalThreadId: number;
}

/**
 * The goal's own thread, and only when it is the requester's.
 *
 * Not the ask's `origin_thread_id`: that is the chat the question was sent
 * FROM, and ask 727 is on record as sent from a conversation that was not its
 * goal's. The goal's thread is where its wake writes, so the request's line and
 * the answer's later wake land in the same place.
 */
async function goalThreadOf(taskId: number, requesterUserId: number): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT t.id
       FROM tasks k
       JOIN threads t ON t.id = k.thread_id
      WHERE k.id = $1 AND t.user_id = $2
      LIMIT 1`,
    [taskId, requesterUserId],
    SHARED_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Whether an unanswered request already sits in this conversation.
 *
 * One pending request per conversation is the rule that keeps everything else
 * unambiguous: one ref for the client's buttons, one request in the prompt
 * beside the ask, one thing a „yes" can be about. A second follow-up while the
 * first is open gets its own threads, as it would have before D530.
 */
async function aRequestAlreadyWaitsIn(askThreadId: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT id FROM introduction_requests
      WHERE mediator_thread_id = $1 AND status = 'pending'
      LIMIT 1`,
    [askThreadId],
    SHARED_QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/**
 * The conversation this request continues, or null when it opens its own.
 *
 * Errors reach the caller: whether to fall back is the caller's call, and a
 * lookup that failed must not read as „there is no conversation" here.
 */
export async function findSharedConversation(
  taskId: number,
  requesterUserId: number,
  mediatorUserId: number,
): Promise<SharedConversation | null> {
  if (!(await followUpInConversationEnabled())) return null;
  const ask = await findEarlierAskThread(
    taskId,
    requesterUserId,
    mediatorUserId,
    AskScope.StillOpen,
  );
  if (ask === null) return null;
  const goalThreadId = await goalThreadOf(taskId, requesterUserId);
  if (goalThreadId === null) return null;
  if (await aRequestAlreadyWaitsIn(ask.id)) return null;
  return { askThreadId: ask.id, goalThreadId };
}

/** Everything the two lines need, gathered by `requestIntroduction`. */
export interface SharedRequestDelivery {
  readonly conversation: SharedConversation;
  readonly requestRef: string;
  readonly mediatorUserId: number;
  readonly requesterUserId: number;
  readonly requesterName: string;
  readonly mediatorName: string;
  readonly targetName: string;
  readonly message: string | null;
  readonly direct: boolean;
}

/**
 * A server line written into a conversation that already exists, pushed live
 * as `message_appended` — the thread is not new, so `thread_created` would be
 * the client being told about a row it already has.
 *
 * No buttons and no ref on the line itself, exactly like a request's opening in
 * its own thread: Accept / Decline are drawn from the THREAD's `request_ref`,
 * which `setThreadStatus` carries live and the sidebar derives on reload. A ref
 * here as well would be a second place for the client to look, and a reload
 * would lose it.
 */
async function appendLine(
  userId: number,
  threadId: number,
  opening: RequestOpening,
): Promise<void> {
  const saved = await saveServerLine(threadId, userId, opening.text);
  emitMessageAppended(String(userId), threadId, randomUUID(), {
    messageId: String(saved.id),
    kind: 'request',
    content: saved.content,
    choices: [],
    ref: {},
  });
}

/**
 * The mediator's side: the request in their ask thread, and the thread back to
 * „needs you" with the ref the client draws Accept / Decline from.
 */
async function tellTheMediator(delivery: SharedRequestDelivery): Promise<void> {
  // G7: the need is already in this thread — continue, do not greet again.
  const language = await userLanguage(String(delivery.mediatorUserId)).catch(
    () => 'ka' as RunLanguage,
  );
  const opening: RequestOpening = {
    language,
    text: incomingRequestFollowUp(
      language,
      delivery.requesterName,
      delivery.targetName,
      delivery.direct,
    ),
  };
  const threadId = delivery.conversation.askThreadId;
  await appendLine(delivery.mediatorUserId, threadId, opening);
  await setThreadStatus(String(delivery.mediatorUserId), threadId, 'needs_you', {
    statusLine: RUN_STRINGS[opening.language].statusLines.needs_you,
    isTask: true,
    requestRef: delivery.requestRef,
  });
}

/**
 * The requester's side: „it has gone" in the goal's thread. The goal's own
 * status is left alone — it belongs to the goal's runs, and the run that sent
 * this request already ends `waiting` on it (`statusAfterRun`).
 */
async function tellTheRequester(delivery: SharedRequestDelivery): Promise<void> {
  const opening = await outgoingRequestLine(
    delivery.requesterUserId,
    delivery.mediatorName,
    delivery.targetName,
    delivery.direct,
  );
  await appendLine(delivery.requesterUserId, delivery.conversation.goalThreadId, opening);
}

/** Both lines of a follow-up request, into the two conversations it continues. */
export async function writeRequestIntoConversation(delivery: SharedRequestDelivery): Promise<void> {
  await Promise.all([tellTheMediator(delivery), tellTheRequester(delivery)]);
}

/**
 * The pending request written into this ask thread, for its owner — or null.
 *
 * The owner check is the thread's own: `mediator_thread_id` is the mediator's
 * ask thread by construction, so its owner IS the person who answers. Asked by
 * thread, never by type: the thread is an `incoming_ask`, and it is what is
 * attached to it that decides whether a request is on the table.
 */
export async function pendingRequestSharingThread(
  threadId: number,
  ownerUserId: string,
): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT ir.id
       FROM introduction_requests ir
       JOIN threads t ON t.id = ir.mediator_thread_id
      WHERE ir.mediator_thread_id = $1 AND t.user_id = $2::int AND ir.status = 'pending'
      ORDER BY ir.id ASC
      LIMIT 1`,
    [threadId, ownerUserId],
    SHARED_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.id ?? null;
}

/**
 * What an ask thread goes back to once the request it carried is settled.
 *
 * The thread is the ASK's again, so it reads as the ask does: a question still
 * waiting for the mediator's answer is `needs_you`, anything else — answered,
 * declined, cancelled — is over. `done` here is never a lie about the request,
 * which has just been answered or withdrawn.
 *
 * A failed read keeps `needs_you`. „Done" on a question somebody still owes an
 * answer to would file it under finished; asking them once too often is the
 * smaller harm, and the next answer or run corrects it.
 */
export async function askThreadStatusAfterRequest(askThreadId: number): Promise<ThreadStatus> {
  try {
    const result = await query<{ status: string }>(
      `SELECT status FROM task_asks
        WHERE ask_thread_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [askThreadId],
      SHARED_QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.status === ASK_STILL_WAITING ? 'needs_you' : 'done';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[shared-request] ask state of thread ${askThreadId} unreadable — keeping needs_you:`,
      (err as Error).message,
    );
    return 'needs_you';
  }
}
