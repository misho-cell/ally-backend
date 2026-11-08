import { query } from '../db/postgres/client';
import { answerIsTheirOwnWords } from './taskAsks.service';

/**
 * The tester's 992 (F1): the asker read „პასუხი: „კი, პირდაპირ დაგაკავშირებთ
 * X-სთან."" in quotes. The mediator had typed „კი, გავაცნობ." and tapped a
 * button; the quoted sentence was his assistant's. The requester is shown the
 * response as a quotation, so only words the mediator actually typed in this
 * thread travel as one (`answerIsTheirOwnWords`, row 303); anything else goes
 * without a quote, and the accept itself is unchanged.
 */
export async function mediatorsOwnWords(
  threadId: number | undefined,
  response: unknown,
): Promise<string | undefined> {
  if (typeof response !== 'string' || response.trim() === '') return undefined;
  return (await answerIsTheirOwnWords(threadId ?? null, response)) ? response : undefined;
}

/**
 * #1750 (tester 40624): „yes, but Giorgi can only make it tomorrow evening" and
 * „no, he is abroad for a month" never reached the asker's run. The model
 * passed its own paraphrase as `response`, which `mediatorsOwnWords` rightly
 * drops, and a button tap carries no text at all — so the event said nothing.
 * The run never quotes the answer (#1750), so it may read what the go-between
 * actually typed since the request reached them, and say it in its own words.
 */
const OWN_LINES_LIMIT = 5;
const OWN_LINES_MAX_CHARS = 600;
const OWN_LINES_TIMEOUT_MS = 3_000;
const INJECTED_NOTE_RE = /^\s*\((სისტემური|system note)/i;

/** The owner's own last few lines in a thread, newest first; empty when unreadable. */
export async function ownersRecentLines(threadId: number): Promise<string[]> {
  try {
    const result = await query<{ content: string | null }>(
      `SELECT content FROM conversations
        WHERE thread_id = $1 AND role = 'user'
        ORDER BY created_at DESC
        LIMIT $2`,
      [threadId, OWN_LINES_LIMIT],
      OWN_LINES_TIMEOUT_MS,
    );
    return result.rows
      .map((r) => (r.content ?? '').trim())
      .filter((line) => line !== '' && !INJECTED_NOTE_RE.test(line));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[intro] could not read the owner's recent lines:", (err as Error).message);
    return [];
  }
}

/**
 * Tester's report 8 Nov, C4: the reply the owner was answering — the latest
 * assistant line before the owner's own latest line — so a „კი" counts as a
 * yes to the route that reply showed. Empty when there is none or it is unreadable.
 */
export async function replyTheOwnerAnswered(threadId: number): Promise<string> {
  try {
    const result = await query<{ content: string | null }>(
      `SELECT a.content FROM conversations a
        WHERE a.thread_id = $1 AND a.role = 'assistant' AND a.kind = 'message'
          AND a.created_at < (SELECT MAX(created_at) FROM conversations
                               WHERE thread_id = $1 AND role = 'user' AND kind = 'message')
        ORDER BY a.created_at DESC
        LIMIT 1`,
      [threadId],
      OWN_LINES_TIMEOUT_MS,
    );
    return (result.rows[0]?.content ?? '').trim();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[intro] could not read the reply the owner answered:', (err as Error).message);
    return '';
  }
}

export async function mediatorsLinesSinceAsked(
  threadId: number | null,
  askedAt: Date | string | null,
): Promise<string | null> {
  if (threadId === null || askedAt === null) return null;
  try {
    const result = await query<{ content: string | null }>(
      `SELECT content FROM conversations
        WHERE thread_id = $1 AND role = 'user' AND created_at >= $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [threadId, askedAt, OWN_LINES_LIMIT],
      OWN_LINES_TIMEOUT_MS,
    );
    const lines = result.rows
      .map((r) => (r.content ?? '').trim())
      .filter((line) => line !== '' && !INJECTED_NOTE_RE.test(line))
      .reverse();
    return lines.length === 0 ? null : lines.join('\n').slice(0, OWN_LINES_MAX_CHARS);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[intro] could not read the go-between's own lines:", (err as Error).message);
    return null;
  }
}

export interface AskedRequest {
  readonly id: number;
  readonly mediator_user_id: number | null;
  readonly mediator_thread_id: number | null;
  readonly created_at: Date | string | null;
}

/**
 * Tester's report 8 Nov, C5: Nana typed Gigi's new number in the request's own
 * card thread, and it was never read — `mediator_thread_id` is set only when a
 * request continues an earlier ask, so a fresh card had no thread here. The
 * card thread is the one linked to the request and owned by the go-between.
 */
export async function goBetweensLinesSinceAsked(req: AskedRequest): Promise<string | null> {
  const threadId = req.mediator_thread_id ?? (await cardThreadOf(req));
  return mediatorsLinesSinceAsked(threadId, req.created_at);
}

async function cardThreadOf(req: AskedRequest): Promise<number | null> {
  if (req.mediator_user_id === null) return null;
  try {
    const result = await query<{ id: number }>(
      `SELECT id FROM threads WHERE introduction_request_id = $1 AND user_id = $2
        ORDER BY id DESC LIMIT 1`,
      [req.id, req.mediator_user_id],
      OWN_LINES_TIMEOUT_MS,
    );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[intro] could not find the go-between's card thread:", (err as Error).message);
    return null;
  }
}
