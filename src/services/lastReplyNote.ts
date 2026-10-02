import { query } from '../db/postgres/client';

/**
 * The tester's 1004 (goal 4324, row 268's evidence): two scheduled wakes three
 * days apart sent the owner the SAME sentence, word for word — one search each,
 * nothing new tried, the same question. The wake did not know what the owner
 * had last read from it; this tells it, and that a repeat is not allowed.
 */

/** Longer than this, the quote is cut — it is a reminder, not a transcript. */
const MAX_QUOTED_CHARS = 600;

const LAST_REPLY_TIMEOUT_MS = 5_000;

/** The last message the owner read from the assistant in this goal's thread, if any. */
export async function lastAssistantMessage(threadId: number): Promise<string | null> {
  const result = await query<{ content: string | null }>(
    `SELECT content FROM conversations
      WHERE thread_id = $1 AND role = 'assistant' AND kind = 'message'
        AND NULLIF(TRIM(content), '') IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [threadId],
    LAST_REPLY_TIMEOUT_MS,
  );
  return result.rows[0]?.content?.trim() || null;
}

/** The wake's note: what the owner last read, and that it must not be sent again. */
export function doNotRepeatNote(lastReply: string): string {
  const quoted =
    lastReply.length > MAX_QUOTED_CHARS ? `${lastReply.slice(0, MAX_QUOTED_CHARS)}…` : lastReply;
  return (
    `მფლობელმა შენგან ბოლოს ეს წაიკითხა: «${quoted}»\n` +
    'იგივე ან თითქმის იგივე ტექსტი აღარ გაუგზავნო. თუ ახალი არაფერია, სცადე სხვა გზა ან სხვა ' +
    'ადამიანი, ან ერთხელ, სხვა სიტყვებით ჰკითხე — ან სულაც ნუ მისწერ, თუ სათქმელი არაფერი გაქვს.'
  );
}
