import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { getCompositeKeysForPhones } from './neo4j.keys';
import { normalizePhone } from './phone';

/**
 * #8845 (the founder, 4 Nov): a shorter cold route always beat a longer warm
 * one, and the graph only ever handed over the SHORTEST paths — so the warm
 * three-hop route through somebody the owner is close to was never even seen
 * when a cold two-hop one existed (unless every link was a member).
 *
 * Here the walk starts again from each person the owner is CLOSE to — said so
 * to Netai, green or blue in old Ally, or family — and goes the shortest way
 * from them to the target. Those chains join the graph's own, and the ranking
 * decides; this file only makes sure they are there to be ranked.
 */

/** How many of the owner's close people the walk starts from. */
const WARM_BRIDGES_TO_TRY = 20;
/** At most this many chains come back from the walk. */
const WARM_CHAINS_TO_CONSIDER = 20;
/** A warm route is at most this long from the warm bridge on — the expensive walk stays short. */
const MAX_HOPS_FROM_WARM_BRIDGE = 3;
const QUERY_TIMEOUT_MS = 5_000;
const NEO4J_TIMEOUT_MS = 8_000;

/**
 * The owner's close people, the strongest reason first: said to Netai
 * (save_close_contact), old-Ally green, old-Ally blue, family.
 */
const WARM_BRIDGES_SQL = `
  SELECT phone FROM (
    SELECT contact_phone AS phone, 1 AS strength FROM warmth_events
     WHERE user_id = $1::int AND kind = 'stated_close'
    UNION ALL
    SELECT contact_phone, 2 FROM human_relationship_tiers WHERE user_id = $1::int AND tier = 'green'
    UNION ALL
    SELECT contact_phone, 3 FROM human_relationship_tiers WHERE user_id = $1::int AND tier = 'blue'
    UNION ALL
    SELECT contact_phone, 4 FROM contact_relationship_scores
     WHERE user_id = $1::int AND relationship_type = 'family'
  ) close_people
  GROUP BY phone
  ORDER BY MIN(strength), phone
  LIMIT $2`;

/** The owner's close people as normalized phones, closest first. */
export async function warmFirstBridgePhones(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    WARM_BRIDGES_SQL,
    [userId, WARM_BRIDGES_TO_TRY],
    QUERY_TIMEOUT_MS,
  );
  const phones = result.rows.map((row) => normalizePhone(row.phone)).filter((p) => p !== '');
  return [...new Set(phones)];
}

/** Composite keys hold several phones joined by '-'; the first is the person's identifier. */
function primaryPhone(compositeKey: string): string {
  return compositeKey.split('-')[0] ?? compositeKey;
}

/** The hops left for the walk after the first one, kept short. */
export function hopsFromWarmBridge(maxHops: number): number {
  return Math.min(MAX_HOPS_FROM_WARM_BRIDGE, maxHops - 1);
}

/** Each chain's middle as phones: the warm bridge first, the owner and target left out. */
export function middlesFromWalk(keyRows: readonly string[][], userKey: string): string[][] {
  return keyRows
    .filter((keys) => keys.length >= 2 && !keys.includes(userKey))
    .map((keys) => keys.slice(0, -1).map((key) => normalizePhone(primaryPhone(key))));
}

async function walkFrom(
  userKey: string,
  bridgeKeys: readonly string[],
  targetKey: string,
  hops: number,
): Promise<string[][]> {
  const session = getSession();
  try {
    const result = await session.run(
      `UNWIND $bridgeKeys AS bridgeKey
       MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(b:AllyNode {phoneKey: bridgeKey}),
             (t:AllyNode {phoneKey: $targetKey})
       WHERE b <> t
       MATCH p = shortestPath((b)-[:CONTACT*1..${hops}]->(t))
       RETURN [n IN nodes(p) | n.phoneKey] AS keys
       LIMIT ${WARM_CHAINS_TO_CONSIDER}`,
      { userKey, bridgeKeys, targetKey },
      { timeout: NEO4J_TIMEOUT_MS },
    );
    return result.records.map((record) => record.get('keys') as string[]);
  } finally {
    await session.close();
  }
}

/**
 * The chains (as middles) that start with somebody the owner is close to.
 * Fails towards none: the graph's own shortest paths still stand.
 */
export async function chainsThroughWarmBridges(
  userId: string,
  userKey: string,
  targetKey: string,
  maxHops: number,
): Promise<string[][]> {
  const hops = hopsFromWarmBridge(maxHops);
  if (hops < 1) return [];
  try {
    const phones = await warmFirstBridgePhones(userId);
    if (phones.length === 0) return [];
    const keys = await getCompositeKeysForPhones(phones);
    const bridgeKeys = [...new Set(phones.map((phone) => keys.get(phone) ?? phone))];
    return middlesFromWalk(await walkFrom(userKey, bridgeKeys, targetKey, hops), userKey);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('findWarmPath warm bridges:', (err as Error).message);
    return [];
  }
}
