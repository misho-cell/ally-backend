import { query } from '../db/postgres/client';

/**
 * 4658 part 3 (box 54617, the founder's seat, 12 Oct 09:26Z): an introduction
 * request to him had its own „waiting for your answer" conversation (opened at
 * 09:18Z), and its reminder card still landed inside an unrelated goal's chat —
 * the one a scheduled check happened to run in. A card that names no goal
 * stays in the run's thread (row 250.1), and an introduction card names a
 * request, not a goal. The request's own conversation is its place.
 */
const INTRO_REQUEST_KIND = 'intro_request';
const INCOMING_REQUEST_THREAD = 'incoming_request';
const QUERY_TIMEOUT_MS = 5_000;
const DIGITS_RE = /^\d+$/u;

/** The request id an introduction card is about; null for any other card. */
export function requestIdOfCard(kind: string, payload: Record<string, unknown>): number | null {
  if (kind !== INTRO_REQUEST_KIND) return null;
  const raw = payload.request_id;
  const id = typeof raw === 'string' && DIGITS_RE.test(raw) ? Number(raw) : raw;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

/** The reader's own conversation for this request; null when it has none. */
export async function requestThreadOf(userId: string, requestId: number): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT id FROM threads
      WHERE user_id = $1 AND introduction_request_id = $2 AND type = $3
      ORDER BY id DESC
      LIMIT 1`,
    [userId, requestId, INCOMING_REQUEST_THREAD],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.id ?? null;
}
