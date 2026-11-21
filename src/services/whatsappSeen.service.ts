import { query } from '../db/postgres/client';

/**
 * Misho, 21 Nov 18:15Z: a second question to a contact waited „until they see
 * the first" — and never could go, because a question delivered in WhatsApp was
 * never marked seen; only opening it in the app counted. In WhatsApp, the
 * person read it when Meta says so (the blue ticks), or answered it there.
 */
const READ_STATUS = 'read';
const QUERY_TIMEOUT_MS = 4_000;

interface RawStatus {
  readonly id?: string;
  readonly status?: string;
}

/** Pure: the ids of our messages that Meta reports as read in this delivery. */
export function readReceiptsOf(payload: unknown): string[] {
  const entries = (payload as { entry?: unknown[] } | null)?.entry ?? [];
  return entries
    .flatMap((entry) => (entry as { changes?: unknown[] }).changes ?? [])
    .flatMap(
      (change) =>
        ((change as { value?: { statuses?: RawStatus[] } }).value?.statuses ?? []) as RawStatus[],
    )
    .filter((s) => s.status === READ_STATUS && typeof s.id === 'string' && s.id !== '')
    .map((s) => s.id as string);
}

/** The person and the conversation of a message we sent, or null. */
async function ourMessage(wamid: string): Promise<{ userId: number; threadId: number } | null> {
  const result = await query<{ user_id: number; thread_id: number | null }>(
    `SELECT user_id, thread_id FROM whatsapp_messages
      WHERE wamid = $1 AND direction = 'out'
      LIMIT 1`,
    [wamid],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row === undefined || row.thread_id === null
    ? null
    : { userId: row.user_id, threadId: row.thread_id };
}

/** The asks in this conversation count as seen by this person. Never throws. */
export async function seenInWhatsapp(userId: number, threadId: number): Promise<void> {
  try {
    const { markAsksSeen } = await import('./taskAsks.service');
    await markAsksSeen(threadId, String(userId));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp] seen not recorded:', (err as Error).message);
  }
}

/** Every read receipt of one delivery marks the asks of its conversation seen. Never throws. */
export async function recordReadReceipts(payload: unknown): Promise<void> {
  for (const wamid of readReceiptsOf(payload)) {
    try {
      const sent = await ourMessage(wamid);
      if (sent !== null) await seenInWhatsapp(sent.userId, sent.threadId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[whatsapp] read receipt not read:', (err as Error).message);
    }
  }
}
