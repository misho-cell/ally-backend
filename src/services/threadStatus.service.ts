import { updateThreadStatus, STATUS_LINES, ThreadStatus } from './threads.service';
import { emitThreadUpdated } from './sse.service';

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
 * Persist a thread's task state and broadcast it to every connected device in
 * one step. statusLine defaults per status (STATUS_LINES); pass an explicit
 * one to override. Best-effort by design — a status hiccup must never fail
 * the run that triggered it.
 */
export async function setThreadStatus(
  userId: string,
  threadId: number,
  status: ThreadStatus,
  opts: { statusLine?: string | null; isTask?: boolean; requestRef?: string } = {},
): Promise<void> {
  const statusLine = opts.statusLine !== undefined ? opts.statusLine : STATUS_LINES[status];
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
