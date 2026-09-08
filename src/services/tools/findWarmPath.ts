import { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { getCompositeKeyForPhone, getCompositeKeyForUser } from '../neo4j.keys';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { accountStateFor, fetchAccountStates, isMemberPhone, AccountState } from './membership';

/**
 * The warm-path walk to an IDENTIFIED target (Ticket 11 Task 10; D132, the
 * founder, 8 Sep): 2–3 hops, point-to-point.
 *
 * Why this is not the fan-out that was capped at one hop: the target is a
 * specific, known person, so the map is not discovering anyone — it is finding
 * the path between two fixed endpoints, which is a bounded search however many
 * hops it takes. Discovery of WHO stays with the fit engine and the searches;
 * this tool refuses to run without a target phone id, by its signature.
 *
 * What comes back is the chain of bridges — names, never numbers — with each
 * bridge's Netai state, because the assistant-to-assistant relay can only pass
 * through a Netai user. Per-hop consent (the open question in the ticket) is
 * settled the way the relay already works: each bridge's own assistant asks
 * that bridge before passing the request on (`relay_ask`), one hop at a time.
 */

const MAX_HOPS = 3;
const MAX_PATHS = 5;
const NEO4J_TIMEOUT_MS = 8_000;
const NAME_QUERY_TIMEOUT_MS = 8_000;

export interface WarmPathBridge {
  phone: string;
  name: string | null;
  is_member: boolean;
  account_state: AccountState;
}

export interface WarmPath {
  hops: number;
  bridges: WarmPathBridge[];
  /** Every bridge is a Netai user, so the assistant-to-assistant relay can carry it end to end. */
  relayable: boolean;
}

export type WarmPathOutcome =
  | {
      found: true;
      target: { phone: string; name: string | null };
      paths: WarmPath[];
      note: string;
    }
  | {
      found: false;
      reason:
        | 'no_target'
        | 'user_phone_not_found'
        | 'target_not_in_graph'
        | 'no_path_within_hops'
        | 'neo4j_unavailable';
      note: string;
    };

const CONSENT_NOTE =
  'Each bridge is asked before the request passes on: write to the FIRST bridge with ' +
  'ask_contact (they are a direct contact), and their assistant relays to the next with ' +
  'their consent (relay_ask). A path with relayable:false has a bridge who is not on Netai — ' +
  'the chain stops there; offer the user an invite for that person or the next path. ' +
  'Name the bridges to the user; never a number.';

interface PathRow {
  keys: string[];
}

/** Composite keys hold several phones joined by '-'; the first is the person's identifier. */
function primaryPhone(compositeKey: string): string {
  return compositeKey.split('-')[0] ?? compositeKey;
}

async function shortestPaths(
  userKey: string,
  targetKey: string,
  maxHops: number,
): Promise<PathRow[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (me:AllyNode {phoneKey: $userKey}), (t:AllyNode {phoneKey: $targetKey})
       MATCH p = allShortestPaths((me)-[:CONTACT*1..${maxHops}]->(t))
       RETURN [n IN nodes(p) | n.phoneKey] AS keys
       LIMIT ${MAX_PATHS}`,
      { userKey, targetKey },
      { timeout: NEO4J_TIMEOUT_MS },
    );
    return result.records.map((r) => ({ keys: r.get('keys') as string[] }));
  } finally {
    await session.close();
  }
}

/**
 * Names for the bridges: the user's own label for a direct contact, the
 * account name for a Netai user, any phonebook's label for a stranger — the
 * same three sources second-degree search names its "via" people from.
 */
async function namesFor(userId: string, phones: string[]): Promise<Map<string, string | null>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; name: string | null }>(
    `SELECT ua.phone,
            COALESCE(
              MAX(ua.alias) FILTER (WHERE ua."contactId" = $2::int),
              MAX(u.name),
              MIN(ua.alias)
            ) AS name
     FROM "UserAlias" ua
     LEFT JOIN "UserPhone" up ON up.phone = ua.phone
     LEFT JOIN "User" u ON u.id = up."userId"
     WHERE ua.phone = ANY($1::text[])
     GROUP BY ua.phone`,
    [phones, userId],
    NAME_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [normalizePhone(r.phone), r.name]));
}

export async function findWarmPath(
  userId: string,
  targetPhoneRaw: string,
  maxHopsRaw = MAX_HOPS,
): Promise<WarmPathOutcome> {
  const targetPhone = normalizePhone(targetPhoneRaw ?? '');
  if (!targetPhone) {
    return {
      found: false,
      reason: 'no_target',
      note:
        'The walk runs only to an IDENTIFIED target (D132). Find who first — a search result or a ' +
        'person the user named — then pass their phone id.',
    };
  }
  const maxHops = Math.min(MAX_HOPS, Math.max(1, Math.floor(maxHopsRaw || MAX_HOPS)));

  let userKey: string;
  try {
    userKey = await getCompositeKeyForUser(Number(userId));
  } catch {
    return {
      found: false,
      reason: 'user_phone_not_found',
      note: 'The user has no phone in the graph.',
    };
  }
  let targetKey: string;
  try {
    targetKey = await getCompositeKeyForPhone(targetPhone);
  } catch {
    return {
      found: false,
      reason: 'target_not_in_graph',
      note: 'Nobody in the network holds this person, so no path exists — offer an invite.',
    };
  }

  let rows: PathRow[];
  try {
    rows = await shortestPaths(userKey, targetKey, maxHops);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('findWarmPath neo4j error:', (err as Error).message);
    return {
      found: false,
      reason: 'neo4j_unavailable',
      note:
        'The connection graph is TEMPORARILY unavailable — a technical outage, not an empty ' +
        'network. Say so plainly and offer to retry; do NOT conclude no path exists.',
    };
  }

  const blocked = new Set((await getExcludedPhones(userId)).map(normalizePhone));
  // Middlemen only: the first key is the user, the last the target.
  const candidates = rows
    .map((r) => r.keys.slice(1, -1).map((k) => normalizePhone(primaryPhone(k))))
    .filter((bridges) => bridges.every((p) => !blocked.has(p)));
  if (candidates.length === 0) {
    return {
      found: false,
      reason: 'no_path_within_hops',
      note:
        `No warm path of up to ${maxHops} hops leads to this person (or every path runs through ` +
        'somebody the user has blocked). The routes left: an invite, or the user writing directly.',
    };
  }

  const phones = [...new Set([targetPhone, ...candidates.flat()])];
  const [names, states] = await Promise.all([namesFor(userId, phones), fetchAccountStates(phones)]);
  const bridgeFor = (phone: string): WarmPathBridge => ({
    phone,
    name: names.get(phone) ?? null,
    is_member: isMemberPhone(states, phone),
    account_state: accountStateFor(states, phone),
  });
  const paths: WarmPath[] = candidates
    .map((bridges) => bridges.map(bridgeFor))
    .map((bridges) => ({
      hops: bridges.length + 1,
      bridges,
      relayable: bridges.every((b) => b.is_member),
    }))
    // Fewest hops first, then the paths the relay can actually carry.
    .sort((a, b) => a.hops - b.hops || Number(b.relayable) - Number(a.relayable));

  return {
    found: true,
    target: { phone: targetPhone, name: names.get(targetPhone) ?? null },
    paths,
    note: CONSENT_NOTE,
  };
}
