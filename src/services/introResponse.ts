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
