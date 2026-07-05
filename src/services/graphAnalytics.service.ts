import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { buildCompositeKey, getCompositeKeyForUser } from './neo4j.keys';
import { getExcludedPhoneSet } from './block.service';
import { normalizePhone } from './phone';
import { buildSearchTerms, toWordStartPattern } from './tools/transliterate';

// Graph-shape questions the word-matching tools can't answer: which of the
// user's own contacts unlock the most reach ("who to bring into Ally"), and
// which non-members bridge best into a tagged group ("who knows the most Axel
// members"). Both rank by connection counts in Neo4j, then resolve names in
// Postgres and strip phones — only a name + contact_ref + score leaves.

const NEO4J_TIMEOUT_MS = 10_000;
const GROUP_QUERY_TIMEOUT_MS = 10_000;
const MAX_GROUP_MEMBERS = 3000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export interface ConnectorResult {
  name: string | null;
  phone: string; // internal — the MCP layer turns this into a contact_ref and drops it
  score: number;
}

export interface ConnectorOutcome {
  found: boolean;
  reason?: string;
  results?: ConnectorResult[];
}

interface Neo4jIntLike {
  toNumber: () => number;
}

function toNumber(value: unknown): number {
  if (value !== null && typeof value === 'object' && 'toNumber' in value) {
    return (value as Neo4jIntLike).toNumber();
  }
  return Number(value ?? 0);
}

function clampLimit(rawLimit: number | undefined): number {
  const n = Math.floor(rawLimit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Turn ranked friend phoneKeys (composite "phoneA-phoneB" or single) into
 * display rows: expand to individual phones, resolve the user's own alias,
 * drop blocked people. The score rides along from the graph.
 */
async function resolveConnectors(
  userId: string,
  ranked: { phoneKey: string; score: number }[],
): Promise<ConnectorResult[]> {
  if (ranked.length === 0) return [];

  const phones = [...new Set(ranked.flatMap((r) => r.phoneKey.split('-')))];
  const [nameResult, excluded] = await Promise.all([
    query<{ phone: string; name: string | null }>(
      `SELECT ua.phone, COALESCE(ua.alias, u.name) AS name
       FROM "UserAlias" ua
       LEFT JOIN "UserPhone" up ON up.phone = ua.phone
       LEFT JOIN "User"      u  ON u.id     = up."userId"
       WHERE ua."contactId" = $1 AND ua.phone = ANY($2)`,
      [userId, phones],
      GROUP_QUERY_TIMEOUT_MS,
    ),
    getExcludedPhoneSet(userId),
  ]);

  const nameByPhone = new Map(nameResult.rows.map((r) => [r.phone, r.name]));
  const out: ConnectorResult[] = [];
  for (const { phoneKey, score } of ranked) {
    const keyPhones = phoneKey.split('-');
    if (keyPhones.some((p) => excluded.has(normalizePhone(p)))) continue;
    // Prefer a phone that resolves to a name; else the first phone (for the ref).
    const named = keyPhones.find((p) => nameByPhone.get(p));
    const phone = named ?? keyPhones[0];
    out.push({ name: named ? (nameByPhone.get(named) ?? null) : null, phone, score });
  }
  return out;
}

/** Rank the user's direct contacts by how many people they reach that the user doesn't already know. */
export async function getTopConnectors(
  userId: string,
  rawLimit?: number,
): Promise<ConnectorOutcome> {
  const limit = clampLimit(rawLimit);
  let userKey: string;
  try {
    userKey = await getCompositeKeyForUser(Number(userId));
  } catch {
    return { found: false, reason: 'user_phone_not_found' };
  }

  const session = getSession();
  let ranked: { phoneKey: string; score: number }[] = [];
  try {
    const result = await session.run(
      `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
       OPTIONAL MATCH (friend)-[:CONTACT]->(t:AllyNode)
       WHERE t.phoneKey <> $userKey AND NOT (me)-[:CONTACT]->(t)
       WITH friend.phoneKey AS phoneKey, count(DISTINCT t) AS reach
       WHERE reach > 0
       RETURN phoneKey, reach
       ORDER BY reach DESC
       LIMIT ${limit}`,
      { userKey },
      { timeout: NEO4J_TIMEOUT_MS },
    );
    ranked = result.records.map((r) => ({
      phoneKey: r.get('phoneKey') as string,
      score: toNumber(r.get('reach')),
    }));
  } catch (err) {
    console.error('getTopConnectors neo4j error:', (err as Error).message);
    return { found: false, reason: 'neo4j_unavailable' };
  } finally {
    await session.close();
  }

  const results = await resolveConnectors(userId, ranked);
  if (results.length === 0) return { found: false, reason: 'no_connectors' };
  return { found: true, results };
}

/**
 * Rank non-members by how many members of a tagged group they connect to
 * ("who knows the most Axel members"). Group = the user's own contacts whose
 * tag matches groupTag.
 */
export async function getGroupConnectors(
  userId: string,
  groupTag: string,
  rawLimit?: number,
): Promise<ConnectorOutcome> {
  const limit = clampLimit(rawLimit);
  const rawTerms = buildSearchTerms(groupTag);
  if (rawTerms.length === 0) return { found: false, reason: 'no_group_tag' };

  const tagCondition = rawTerms.map((_, i) => `LOWER(tag) ~ $${i + 2}`).join(' OR ');
  const memberResult = await query<{ phone: string }>(
    `SELECT DISTINCT phone FROM "UserTags"
     WHERE "contactId" = $1 AND (${tagCondition})
     LIMIT ${MAX_GROUP_MEMBERS}`,
    [userId, ...rawTerms.map(toWordStartPattern)],
    GROUP_QUERY_TIMEOUT_MS,
  );
  const groupPhones = memberResult.rows.map((r) => r.phone);
  if (groupPhones.length === 0) return { found: false, reason: 'no_group_members' };

  let userKey: string;
  try {
    userKey = await getCompositeKeyForUser(Number(userId));
  } catch {
    return { found: false, reason: 'user_phone_not_found' };
  }

  const session = getSession();
  let ranked: { phoneKey: string; score: number }[] = [];
  try {
    const result = await session.run(
      `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
       WHERE NONE(gp IN $groupPhones WHERE friend.phoneKey CONTAINS gp)
       MATCH (friend)-[:CONTACT]->(m:AllyNode)
       WHERE ANY(gp IN $groupPhones WHERE m.phoneKey CONTAINS gp)
       WITH friend.phoneKey AS phoneKey, count(DISTINCT m) AS links
       RETURN phoneKey, links
       ORDER BY links DESC
       LIMIT ${limit}`,
      { userKey, groupPhones },
      { timeout: NEO4J_TIMEOUT_MS },
    );
    ranked = result.records.map((r) => ({
      phoneKey: r.get('phoneKey') as string,
      score: toNumber(r.get('links')),
    }));
  } catch (err) {
    console.error('getGroupConnectors neo4j error:', (err as Error).message);
    return { found: false, reason: 'neo4j_unavailable' };
  } finally {
    await session.close();
  }

  const results = await resolveConnectors(userId, ranked);
  if (results.length === 0) return { found: false, reason: 'no_connectors' };
  return { found: true, results };
}

export interface GraphDiagnostic {
  userId: number;
  phones: string[];
  compositeKey: string;
  keyForms: { key: string; directContacts: number }[];
  workingKey: string | null;
  topConnectorsSample: { phoneKey: string; reach: number }[];
}

/**
 * Admin-only one-off validation for the graph tools: which phoneKey form the
 * account's node actually uses (composite vs. single) and a raw top-connectors
 * sample. Returns phoneKeys unmasked — this is an admin diagnostic, not a
 * user-facing tool, and admins already see phones in the 360 profile.
 */
export async function getGraphDiagnostic(
  phone: string,
): Promise<GraphDiagnostic | { error: string }> {
  const userRow = await query<{ userId: number }>(
    'SELECT "userId" FROM "UserPhone" WHERE phone = $1 LIMIT 1',
    [phone],
  );
  const userId = userRow.rows[0]?.userId;
  if (userId === undefined) return { error: 'phone_not_found' };

  const phonesRes = await query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1 ORDER BY phone',
    [userId],
  );
  const phones = phonesRes.rows.map((r) => r.phone);
  if (phones.length === 0) return { error: 'no_phones' };

  const compositeKey = buildCompositeKey(phones);
  const candidates = [...new Set([compositeKey, ...phones])];

  const session = getSession();
  try {
    const diag = await session.run(
      `MATCH (me:AllyNode) WHERE me.phoneKey IN $keys
       OPTIONAL MATCH (me)-[:CONTACT]->(f)
       RETURN me.phoneKey AS key, count(f) AS c`,
      { keys: candidates },
      { timeout: NEO4J_TIMEOUT_MS },
    );
    const keyForms = diag.records.map((r) => ({
      key: r.get('key') as string,
      directContacts: toNumber(r.get('c')),
    }));

    const best = [...keyForms].sort((a, b) => b.directContacts - a.directContacts)[0];
    const workingKey = best && best.directContacts > 0 ? best.key : null;

    let topConnectorsSample: { phoneKey: string; reach: number }[] = [];
    if (workingKey) {
      const top = await session.run(
        `MATCH (me:AllyNode {phoneKey: $key})-[:CONTACT]->(friend:AllyNode)
         OPTIONAL MATCH (friend)-[:CONTACT]->(t:AllyNode)
         WHERE t.phoneKey <> me.phoneKey AND NOT (me)-[:CONTACT]->(t)
         WITH friend.phoneKey AS phoneKey, count(DISTINCT t) AS reach
         WHERE reach > 0
         RETURN phoneKey, reach ORDER BY reach DESC LIMIT 10`,
        { key: workingKey },
        { timeout: NEO4J_TIMEOUT_MS },
      );
      topConnectorsSample = top.records.map((r) => ({
        phoneKey: r.get('phoneKey') as string,
        reach: toNumber(r.get('reach')),
      }));
    }

    return { userId, phones, compositeKey, keyForms, workingKey, topConnectorsSample };
  } finally {
    await session.close();
  }
}
