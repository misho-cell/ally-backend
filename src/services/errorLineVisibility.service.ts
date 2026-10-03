import { query } from '../db/postgres/client';

/**
 * §89 — ONE NAMED „TRY AGAIN" LINE TAKEN OFF AN OWNER'S CHAT.
 *
 * Misho, 3 October („კი დამალე"): thread 26302 shows „the reply did not come
 * together, try again" under a scheduled check the owner never started
 * (07:21:46Z; the cause is fixed in 5e66259). §86's route moves only
 * owner-role rows, and `event` would not do here: the model's history reads
 * `event` rows, so the error text would be fed back to the model.
 *
 * So an assistant `error` row moves to `hidden`, a kind no reader of the chat
 * or of the model's history includes, and back again for the undo. Nothing is
 * deleted and no text changes.
 */
const QUERY_TIMEOUT_MS = 5_000;
const ERROR_KIND = 'error';
const HIDDEN_KIND = 'hidden';

export interface ErrorLineChange {
  readonly id: string;
  readonly thread_id: number;
  readonly was: string;
  readonly now: string;
}

async function moveAssistantRow(
  threadId: number,
  messageId: string,
  from: string,
  to: string,
): Promise<ErrorLineChange | null> {
  const result = await query<{ id: string }>(
    `UPDATE conversations SET kind = $4
      WHERE thread_id = $1 AND id::text = $2 AND role = 'assistant' AND kind = $3
      RETURNING id::text AS id`,
    [threadId, messageId, from, to],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined ? null : { id: row.id, thread_id: threadId, was: from, now: to };
}

/** Hides one error line; null when the thread holds no such error row. */
export function hideErrorLine(
  threadId: number,
  messageId: string,
): Promise<ErrorLineChange | null> {
  return moveAssistantRow(threadId, messageId, ERROR_KIND, HIDDEN_KIND);
}

/** The undo: a hidden error line is shown again. */
export function showErrorLine(
  threadId: number,
  messageId: string,
): Promise<ErrorLineChange | null> {
  return moveAssistantRow(threadId, messageId, HIDDEN_KIND, ERROR_KIND);
}
