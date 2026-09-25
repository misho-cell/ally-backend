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
/** How many routes the user is shown. */
const MAX_PATHS = 5;
/**
 * ⚠️ HOW MANY ROUTES ARE RANKED BEFORE THAT CUT IS MADE — item D, 25 September.
 *
 * The tester's case: second-degree search listed four bridges to an
 * electrician, ONE of them a Netai user; `find_warm_path` to the same person
 * returned five routes, every one of them through an old-Ally account, every
 * one `relayable: false`. The usable bridge was not ranked below the others —
 * it was never ranked at all.
 *
 * `LIMIT 5` sat in the Cypher, and Neo4j applies it to a stream of equally
 * short paths in whatever order it produces them. The sort that puts a
 * relayable route first ran in TypeScript, AFTER that cut, so it could only
 * reorder five survivors chosen before anything knew which bridges were on
 * Netai — membership lives in Postgres and the graph cannot see it.
 *
 * Exactly the fault of the day in a third place: a reader took a slice and
 * then concluded over it. The blocked-contact filter had it too — five paths
 * could all run through blocked people and the tool would answer „no warm
 * path" while an unblocked one waited just past the cut.
 *
 * So the graph is asked for a wider set, the ranking happens over all of it,
 * and the cut to MAX_PATHS is the LAST thing that happens.
 */
const PATHS_TO_CONSIDER = 25;
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
      /**
       * False when the graph held at least `PATHS_TO_CONSIDER` routes at this
       * distance, so the ones shown were ranked over a slice and not over
       * everything. It is said out loud rather than left to be assumed,
       * because „these are the five best" and „these are five of many" are
       * different facts and only one of them is safe to act on.
       */
      ranked_every_route: boolean;
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

/**
 * Row 234 — this note is served in the RESPONSE, and a response is read at the
 * moment the model picks its next call. It said „write to the FIRST bridge
 * with ask_contact" for hours after the tool's own description had been
 * rewritten to say the opposite, and the description was never going to win
 * that argument.
 *
 * Now it says what the description says, and it keeps the distinction the
 * description keeps: `requestIntroduction` resolves the mediator out of the
 * REQUESTER's own aliases, so it can be addressed to the first bridge and to
 * nobody further along the chain.
 */
const CONSENT_NOTE =
  'Each bridge is asked before the request passes on. When the FIRST bridge can reach the ' +
  'target themselves (hops: 1), that is an introduction and goes through request_introduction ' +
  '— never ask_contact, which files it as an ordinary question and connects nobody. On a ' +
  'LONGER path, ask_contact the first bridge for the hops in between, because ' +
  'request_introduction can only be addressed to the user’s own contact and the second and ' +
  'third bridges are not; their assistant relays onward with their consent (relay_ask). ' +
  'A path with relayable:false has a bridge who is not on Netai — the chain stops there; ' +
  'offer the user an invite for that person or the next path. ' +
  'Name the bridges to the user; never a number.';

/**
 * Served only when the cut actually bit. „These are the best routes" and
 * „these are some of many routes" are different facts, and the tool is the
 * only thing in the conversation that knows which one it is handing over.
 */
const MANY_ROUTES_NOTE =
  `This person is reachable by MORE than the ${MAX_PATHS} routes shown — these are the best of ` +
  `the first ${PATHS_TO_CONSIDER} the graph returned, not the best that exist. If none of them ` +
  'suits, say there are other routes rather than telling the user these are all of them.';

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
       LIMIT ${PATHS_TO_CONSIDER}`,
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
    // Fewest hops first, then the paths the relay can actually carry. Hops
    // stay ahead of relayable on purpose: a one-hop bridge who is not on Netai
    // is still the user's own contact, whom they can simply write to.
    .sort((a, b) => a.hops - b.hops || Number(b.relayable) - Number(a.relayable))
    // ⚠️ THE CUT IS MADE HERE, AFTER THE RANKING, AND NOWHERE ELSE.
    .slice(0, MAX_PATHS);

  return {
    found: true,
    target: { phone: targetPhone, name: names.get(targetPhone) ?? null },
    paths,
    ranked_every_route: rows.length < PATHS_TO_CONSIDER,
    note: rows.length < PATHS_TO_CONSIDER ? CONSENT_NOTE : `${CONSENT_NOTE} ${MANY_ROUTES_NOTE}`,
  };
}
