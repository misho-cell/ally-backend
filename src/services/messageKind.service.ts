import { query } from '../db/postgres/client';

/**
 * §86 — ONE NAMED MESSAGE, MOVED BETWEEN „message" AND „event".
 *
 * Misho, 2 October (#498's leftover): thread 30493 still shows, as the
 * owner's own bubble, a turn the server wrote to the model
 * („[მოვლენა] მფლობელმა უპასუხა მიზნის კითხვას …", 11:44:20Z). #498 stopped
 * new ones; the one already stored stays until somebody moves it.
 *
 * Narrow on purpose: a row in the named thread, written in the owner's role,
 * and only between the two kinds — `event` hides it from the chat (the history
 * endpoint shows message/pending/error only), `message` is the undo. Nothing
 * is deleted and no text changes.
 */
const QUERY_TIMEOUT_MS = 5_000;

export enum MessageKind {
  Message = 'message',
  Event = 'event',
}

export interface MovedMessage {
  readonly id: string;
  readonly thread_id: number;
  readonly was: MessageKind;
  readonly now: MessageKind;
}

export async function setUserMessageKind(
  threadId: number,
  messageId: string,
  kind: MessageKind,
): Promise<MovedMessage | null> {
  const result = await query<{ id: string; was: MessageKind }>(
    `WITH before AS (
       SELECT id, kind AS was FROM conversations
        WHERE thread_id = $1 AND id::text = $2 AND role = 'user'
          AND kind IN ('message', 'event')
        LIMIT 1
     )
     UPDATE conversations c SET kind = $3
       FROM before b WHERE c.id = b.id
     RETURNING c.id::text AS id, b.was`,
    [threadId, messageId, kind],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : { id: row.id, thread_id: threadId, was: row.was, now: kind };
}
