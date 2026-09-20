import { updateThreadStatus, ThreadStatus, userLanguage } from './threads.service';
import { emitThreadUpdated } from './sse.service';
import { RunLanguage, RUN_STRINGS } from './runLanguage';

// Trailing decoration that may follow the actual last sentence character:
// whitespace, emoji, markdown emphasis, closing quotes/brackets, stray dots.
const TRAILING_DECOR_RE = /(?:[\s\p{Extended_Pictographic}*_~"'”„«»)\]}.!…-]|\uFE0F|\u200D)+$/u;

/**
 * Whether the reply ends by asking the user something — the deterministic
 * signal for the needs_you thread status when no explicit options/choices
 * were presented. Tolerates trailing emoji/markdown after the question mark.
 */
export function endsWithQuestion(reply: string): boolean {
  const trimmed = reply.replace(TRAILING_DECOR_RE, '');
  return trimmed.endsWith('?') || trimmed.endsWith('？');
}

/**
 * The caption for a status when the caller names none, in the owner's own
 * language.
 *
 * The seat's 332, measured on Test 1 — thirteen threads, not one Georgian
 * character in any message the owner ever wrote, and SIX of them captioned
 * „ველოდები პასუხს" or „შენი პასუხი სჭირდება" while the other seven said
 * „Waiting for a reply" and „Needs your answer".
 *
 * Both halves were this function. The seven came from callers that pass
 * `RUN_STRINGS[lang].statusLines.*` themselves — chat.service, runFailure,
 * taskEngine's top-up branch, taskAsks. The six came from the callers that
 * pass nothing and took a default that was one flat Georgian constant with no
 * language input at all.
 *
 * So this is NOT the same fault as the empty-thread default next door in
 * threads.service, and the seat's guess that they are one bug seen twice is
 * the one thing in 332 I can rule out: that one is a resolver with a wrong
 * fallback, this one was a writer with no resolver.
 *
 * `done` keeps its null — an idle thread needs no caption, in any language.
 */
async function defaultStatusLine(userId: string, status: ThreadStatus): Promise<string | null> {
  if (status === 'done') return null;
  const language = await userLanguage(userId).catch(() => 'ka' as RunLanguage);
  return RUN_STRINGS[language].statusLines[status];
}

/**
 * Persist a thread's task state and broadcast it to every connected device in
 * one step. statusLine defaults per status, in the owner's language; pass an
 * explicit one to override. Best-effort by design — a status hiccup must never
 * fail the run that triggered it.
 */
export async function setThreadStatus(
  userId: string,
  threadId: number,
  status: ThreadStatus,
  opts: { statusLine?: string | null; isTask?: boolean; requestRef?: string } = {},
): Promise<void> {
  const statusLine =
    opts.statusLine !== undefined ? opts.statusLine : await defaultStatusLine(userId, status);
  try {
    await updateThreadStatus(threadId, status, statusLine, opts.isTask);
    emitThreadUpdated(userId, {
      id: threadId,
      status,
      status_line: statusLine,
      ...(opts.isTask !== undefined && { is_task: opts.isTask }),
      ...(opts.requestRef !== undefined && { request_ref: opts.requestRef }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[thread-status] failed for thread ${threadId}:`, (err as Error).message);
  }
}

/**
 * Whether somebody still owes an answer — or whether we could not find out.
 *
 * The third value is the whole point. A check that failed is not a „no".
 */
export type AskCheck = boolean | 'unknown';

/**
 * The status an engine run ends on.
 *
 * WHY „UNKNOWN" IS NOT „NO". The pending-ask check used to be caught into
 * `false`, so a database hiccup while asking „is somebody still to answer this"
 * was rendered as „nobody is" — and the goal went to `done`, on the badge the
 * owner reads to know whether the thing is finished. An error wearing the
 * clothes of a confident answer is the same substitution the product made when
 * it told somebody their note was deleted and it was not, and the same one the
 * admin screens exist to prevent: „we could not look" quietly becoming „there
 * is nothing there".
 *
 * So unknown counts as waiting. `waiting` claims only that something may still
 * be out there, which is true when we cannot tell. `done` claims nothing is,
 * which we do not know.
 */
export function runStatus(opts: {
  asksOwner: boolean;
  requestCreated: boolean;
  pendingAsk: AskCheck;
}): ThreadStatus {
  if (opts.asksOwner) return 'needs_you';
  if (opts.requestCreated || opts.pendingAsk === true || opts.pendingAsk === 'unknown') {
    return 'waiting';
  }
  return 'done';
}
