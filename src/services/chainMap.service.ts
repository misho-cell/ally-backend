import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { getExcludedPhones } from './block.service';
import {
  CandidatePath,
  ChainMap,
  chainMapOf,
  LinkPerson,
  MAX_CHAIN_HOPS,
  offerable,
  rankedPaths,
} from './chainMap';
import { confirmedWarmTieSql } from './chorusCap';
import { decodeContactRef, encodeContactRef } from './mcp/contactRef';
import { getCompositeKeyForPhone, getCompositeKeyForUser } from './neo4j.keys';
import { normalizePhone, phoneDigits } from './phone';
import { namesFor } from './tools/findWarmPath';
import { AccountDetails, accountDetailsFor, fetchAccountStates } from './tools/membership';

const PATHS_TO_CONSIDER = 25;
const NEO4J_TIMEOUT_MS = 8_000;
const STEP_QUERY_TIMEOUT_MS = 5_000;

/** Composite keys hold several phones joined by '-'; the first is the person's identifier. */
function primaryPhone(compositeKey: string): string {
  return normalizePhone(compositeKey.split('-')[0] ?? compositeKey);
}

/** The middles of the shortest paths, up to four steps; empty when either end is not in the graph. */
async function graphMiddles(ownerId: number, targetPhone: string): Promise<string[][]> {
  let ownerKey: string;
  let targetKey: string;
  try {
    ownerKey = await getCompositeKeyForUser(ownerId);
    targetKey = await getCompositeKeyForPhone(targetPhone);
  } catch {
    return [];
  }
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (me:AllyNode {phoneKey: $ownerKey}), (t:AllyNode {phoneKey: $targetKey})
       MATCH p = allShortestPaths((me)-[:CONTACT*1..${MAX_CHAIN_HOPS}]->(t))
       RETURN [n IN nodes(p) | n.phoneKey] AS keys
       LIMIT ${PATHS_TO_CONSIDER}`,
      { ownerKey, targetKey },
      { timeout: NEO4J_TIMEOUT_MS },
    );
    return result.records.map((r) => (r.get('keys') as string[]).slice(1, -1).map(primaryPhone));
  } finally {
    await session.close();
  }
}

interface StepVerdict {
  readonly warm: boolean;
  readonly blocked: boolean;
}

/**
 * Each step of each path — who passes it on, to whom — read at once: a confirmed
 * warm tie, and a block between the two in either direction (§127: blocks hold
 * along the whole chain).
 */
async function stepVerdicts(
  steps: readonly { readonly fromUser: number; readonly toPhone: string }[],
): Promise<StepVerdict[]> {
  if (steps.length === 0) return [];
  const result = await query<{ i: number; warm: boolean; blocked: boolean }>(
    `SELECT s.i, ${confirmedWarmTieSql('s.from_user', 's.to_phone')} AS warm,
            EXISTS (
              SELECT 1 FROM "UserBlock" ub
               WHERE (ub."blockerId" = s.from_user
                      AND regexp_replace(ub."blockedPhone", '\\D', '', 'g') = regexp_replace(s.to_phone, '\\D', '', 'g'))
                  OR (ub."blockerId" IN (SELECT up."userId" FROM "UserPhone" up
                                           WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace(s.to_phone, '\\D', '', 'g'))
                      AND ub."blockedPhone" IN (SELECT up2.phone FROM "UserPhone" up2 WHERE up2."userId" = s.from_user))
            ) AS blocked
       FROM unnest($1::int[], $2::text[]) WITH ORDINALITY AS s(from_user, to_phone, i)`,
    [steps.map((s) => s.fromUser), steps.map((s) => s.toPhone)],
    STEP_QUERY_TIMEOUT_MS,
  );
  const byIndex = new Map(result.rows.map((r) => [Number(r.i), r]));
  return steps.map((_, index) => {
    const row = byIndex.get(index + 1);
    return { warm: row?.warm === true, blocked: row?.blocked === true };
  });
}

/** The steps of one path: the owner to the first member, each member to the next, the last to the target. */
function stepsOf(
  ownerId: number,
  middle: readonly string[],
  targetPhone: string,
  states: Map<string, AccountDetails>,
): { fromUser: number; toPhone: string }[] {
  const takers = [ownerId, ...middle.map((phone) => accountDetailsFor(states, phone).user_id ?? 0)];
  const receivers = [...middle, targetPhone];
  return receivers.map((toPhone, index) => ({ fromUser: takers[index], toPhone }));
}

/** The paths every member of which may carry the request, each with its warm steps counted. */
async function candidatePaths(
  ownerId: number,
  targetPhone: string,
  middles: readonly string[][],
  states: Map<string, AccountDetails>,
): Promise<CandidatePath[]> {
  const excluded = new Set((await getExcludedPhones(String(ownerId))).map(phoneDigits));
  const isMember = (phone: string): boolean =>
    accountDetailsFor(states, phone).state === 'netai_user';
  const kept = middles.filter((middle) =>
    offerable(middle, isMember, (phone) => excluded.has(phoneDigits(phone))),
  );
  if (excluded.has(phoneDigits(targetPhone))) return [];
  const allSteps = kept.map((middle) => stepsOf(ownerId, middle, targetPhone, states));
  const verdicts = await stepVerdicts(allSteps.flat());
  let at = 0;
  return kept.flatMap((middle, index) => {
    const own = verdicts.slice(at, at + allSteps[index].length);
    at += allSteps[index].length;
    if (own.some((v) => v.blocked)) return [];
    return [{ middle, warmSteps: own.filter((v) => v.warm).length }];
  });
}

/**
 * The maps from this owner to the person behind a sealed id; null when the id
 * was not minted for this owner. An empty list is „no path a member can carry".
 */
export async function chainMapsFor(ownerId: number, ref: string): Promise<ChainMap[] | null> {
  const decoded = decodeContactRef(String(ownerId), ref);
  if (decoded === null) return null;
  const targetPhone = normalizePhone(decoded);
  const middles = await graphMiddles(ownerId, targetPhone);
  if (middles.length === 0) return [];
  const phones = [...new Set([targetPhone, ...middles.flat()])];
  const states = await fetchAccountStates(phones);
  const ranked = rankedPaths(await candidatePaths(ownerId, targetPhone, middles, states));
  if (ranked.length === 0) return [];
  const names = await namesFor(String(ownerId), phones);
  const person = (phone: string): LinkPerson => ({
    id: encodeContactRef(String(ownerId), phone),
    name: names.get(phone) ?? null,
    isMember: accountDetailsFor(states, phone).state === 'netai_user',
  });
  return ranked.map((path) => chainMapOf(path, person, person(targetPhone)));
}
