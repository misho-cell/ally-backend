import { query } from '../db/postgres/client';

const CHAIN_QUERY_TIMEOUT_MS = 5_000;

/**
 * 5347 (the founder's word, 16 Oct): a named target five handshakes away is
 * reached link by link — owner → L1 → L2 → L3 → L4 → the person — so a request
 * may be passed on four times. Never further: past that it is a chain letter.
 */
export const MAX_RELAYS_IN_A_CHAIN = 4;
/** How many times the request behind this ask was passed on before it reached its reader. */
export async function relaysBefore(askId: number): Promise<number> {
  const result = await query<{ relays: number | null }>(
    `WITH RECURSIVE chain(id, parent_ask_id, depth) AS (
       SELECT id, parent_ask_id, 0 FROM task_asks WHERE id = $1
       UNION ALL
       SELECT p.id, p.parent_ask_id, c.depth + 1
         FROM task_asks p JOIN chain c ON p.id = c.parent_ask_id
        WHERE c.depth < $2
     )
     SELECT MAX(depth) AS relays FROM chain`,
    [askId, MAX_RELAYS_IN_A_CHAIN + 1],
    CHAIN_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.relays ?? 0);
}
