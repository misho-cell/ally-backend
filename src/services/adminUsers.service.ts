import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { getCompositeKeyForUser } from './neo4j.keys';
import {
  DailyCount,
  LabeledCount,
  RecentSearch,
  UserAccount,
  UserActivity,
  UserContextEntry,
  UserDevice,
  UserDevices,
  UserListItem,
  UserMemory,
  UserNetwork,
  UserOutcomes,
  UserProfile,
  UserSearches,
} from '../types';

const TREND_WINDOW_DAYS = 30;
const RECENT_SEARCH_LIMIT = 10;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const NEO4J_TIMEOUT_MS = 10_000;

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function toLabeledCounts(rows: { label: string | null; count: string }[]): LabeledCount[] {
  return rows.map((r) => ({ label: r.label ?? 'unknown', count: toNumber(r.count) }));
}

interface Neo4jInteger {
  toNumber: () => number;
}

function isNeo4jInteger(value: unknown): value is Neo4jInteger {
  return typeof value === 'object' && value !== null && 'toNumber' in value;
}

function toNeoNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (isNeo4jInteger(value)) return value.toNumber();
  return Number(value);
}

export async function listUsers(rawQuery: string, rawLimit: number): Promise<UserListItem[]> {
  const q = rawQuery.trim().toLowerCase();
  const like = `%${q}%`;
  const limit = Math.min(Math.max(Math.floor(rawLimit) || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);

  const result = await query<{
    id: number;
    name: string | null;
    city: string | null;
    subscription_status: string;
    created_at: string | null;
    last_active: string | null;
    contacts_count: string;
    phones: string[];
  }>(
    `SELECT u.id, u.name, u.city, u.subscription_status,
            u."createdAt" AS created_at,
            (SELECT MAX(c.created_at) FROM conversations c WHERE c.user_id = u.id) AS last_active,
            (SELECT COUNT(*) FROM "UserAlias" ua WHERE ua."contactId" = u.id)       AS contacts_count,
            ARRAY(SELECT phone FROM "UserPhone" up WHERE up."userId" = u.id ORDER BY phone) AS phones
     FROM "User" u
     WHERE u."deletedAt" IS NULL
       AND ($1 = ''
            OR LOWER(u.name) LIKE $2
            OR EXISTS (SELECT 1 FROM "UserPhone" up WHERE up."userId" = u.id AND up.phone LIKE $2))
     ORDER BY u."createdAt" DESC NULLS LAST
     LIMIT $3`,
    [q, like, limit],
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    phones: r.phones ?? [],
    city: r.city,
    subscriptionStatus: r.subscription_status,
    createdAt: r.created_at,
    lastActiveAt: r.last_active,
    contactsCount: toNumber(r.contacts_count),
  }));
}

async function getAccount(userId: number): Promise<UserAccount | null> {
  const [userResult, phoneResult] = await Promise.all([
    query<{
      id: number;
      name: string | null;
      email: string | null;
      employer: string | null;
      jobPosition: string | null;
      city: string | null;
      createdAt: string | null;
      deletedAt: string | null;
      subscription_tier: string;
      subscription_status: string;
      trial_ends_at: string | null;
      current_period_ends_at: string | null;
      paddle_customer_id: string | null;
    }>(
      `SELECT id, name, email, employer, "jobPosition", city,
              "createdAt", "deletedAt",
              subscription_tier, subscription_status,
              trial_ends_at, current_period_ends_at, paddle_customer_id
       FROM "User" WHERE id = $1`,
      [userId],
    ),
    query<{ phone: string }>('SELECT phone FROM "UserPhone" WHERE "userId" = $1 ORDER BY phone', [
      userId,
    ]),
  ]);

  const u = userResult.rows[0];
  if (!u) return null;

  return {
    id: Number(u.id),
    name: u.name,
    email: u.email,
    employer: u.employer,
    jobPosition: u.jobPosition,
    city: u.city,
    phones: phoneResult.rows.map((r) => r.phone),
    createdAt: u.createdAt,
    deletedAt: u.deletedAt,
    subscriptionTier: u.subscription_tier,
    subscriptionStatus: u.subscription_status,
    trialEndsAt: u.trial_ends_at,
    currentPeriodEndsAt: u.current_period_ends_at,
    paddleCustomerId: u.paddle_customer_id,
  };
}

async function getNeo4jReach(
  userId: number,
): Promise<{ firstDegree: number | null; secondDegree: number | null }> {
  let userKey: string;
  try {
    userKey = await getCompositeKeyForUser(userId);
  } catch {
    return { firstDegree: null, secondDegree: null };
  }

  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
       OPTIONAL MATCH (friend)-[:CONTACT]->(target:AllyNode)
       WHERE target.phoneKey <> me.phoneKey
       WITH friend, COUNT(DISTINCT target) AS fc
       RETURN COUNT(friend) AS first_degree, SUM(fc) AS second_degree`,
      { userKey },
      { timeout: NEO4J_TIMEOUT_MS },
    );
    const row = result.records[0];
    return {
      firstDegree: toNeoNumber(row?.get('first_degree')),
      secondDegree: toNeoNumber(row?.get('second_degree')),
    };
  } catch {
    return { firstDegree: null, secondDegree: null };
  } finally {
    await session.close();
  }
}

async function getNetwork(userId: number): Promise<UserNetwork> {
  const [counts, reach] = await Promise.all([
    query<{ contacts: string; tags: string; blocked: string; deceased: string }>(
      `SELECT
         (SELECT COUNT(*) FROM "UserAlias"       WHERE "contactId" = $1) AS contacts,
         (SELECT COUNT(*) FROM "UserTags"        WHERE "contactId" = $1) AS tags,
         (SELECT COUNT(*) FROM "UserBlock"       WHERE "blockerId" = $1) AS blocked,
         (SELECT COUNT(*) FROM "ContactDeceased" WHERE "userId"    = $1) AS deceased`,
      [userId],
    ),
    getNeo4jReach(userId),
  ]);

  const row = counts.rows[0];
  return {
    contactsCount: toNumber(row?.contacts),
    tagsCount: toNumber(row?.tags),
    blockedCount: toNumber(row?.blocked),
    deceasedCount: toNumber(row?.deceased),
    firstDegree: reach.firstDegree,
    secondDegree: reach.secondDegree,
  };
}

async function getActivity(userId: number): Promise<UserActivity> {
  const [summary, byDay] = await Promise.all([
    query<{ threads: string; messages: string; first_at: string | null; last_at: string | null }>(
      `SELECT
         (SELECT COUNT(*) FROM threads WHERE user_id = $1) AS threads,
         COUNT(*)                                          AS messages,
         MIN(created_at)                                   AS first_at,
         MAX(created_at)                                   AS last_at
       FROM conversations
       WHERE user_id = $1 AND (kind IS NULL OR kind <> 'step')`,
      [userId],
    ),
    query<{ day: string; count: string }>(
      `SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
       FROM conversations
       WHERE user_id = $1 AND (kind IS NULL OR kind <> 'step')
         AND created_at > NOW() - ($2 || ' days')::INTERVAL
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`,
      [userId, TREND_WINDOW_DAYS],
    ),
  ]);

  const row = summary.rows[0];
  const activityByDay: DailyCount[] = byDay.rows.map((r) => ({
    day: r.day,
    count: toNumber(r.count),
  }));
  return {
    threadsCount: toNumber(row?.threads),
    messageCount: toNumber(row?.messages),
    firstActivityAt: row?.first_at ?? null,
    lastActivityAt: row?.last_at ?? null,
    activityByDay,
  };
}

async function getSearches(userId: number): Promise<UserSearches> {
  const id = String(userId);
  const [totals, byType, recent] = await Promise.all([
    query<{ total: string; flagged: string }>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE flagged) AS flagged
       FROM search_activity WHERE user_id = $1`,
      [id],
    ),
    query<{ label: string | null; count: string }>(
      `SELECT tool AS label, COUNT(*) AS count
       FROM search_activity WHERE user_id = $1
       GROUP BY tool ORDER BY COUNT(*) DESC`,
      [id],
    ),
    query<{ query: string; tool: string | null; flagged: boolean; created_at: string }>(
      `SELECT query, tool, flagged, created_at
       FROM search_activity WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [id, RECENT_SEARCH_LIMIT],
    ),
  ]);

  const recentSearches: RecentSearch[] = recent.rows.map((r) => ({
    query: r.query,
    tool: r.tool,
    flagged: r.flagged,
    createdAt: r.created_at,
  }));
  return {
    totalSearches: toNumber(totals.rows[0]?.total),
    byType: toLabeledCounts(byType.rows),
    flaggedCount: toNumber(totals.rows[0]?.flagged),
    recent: recentSearches,
  };
}

async function getOutcomes(userId: number): Promise<UserOutcomes> {
  const id = String(userId);
  const [byStatus, mediated, insights, facts] = await Promise.all([
    query<{ label: string | null; count: string }>(
      `SELECT status AS label, COUNT(*) AS count
       FROM introduction_requests WHERE requester_user_id = $1
       GROUP BY status ORDER BY COUNT(*) DESC`,
      [userId],
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM introduction_requests WHERE mediator_user_id = $1',
      [userId],
    ),
    query<{ count: string }>('SELECT COUNT(*) AS count FROM contact_insights WHERE user_id = $1', [
      id,
    ]),
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM contact_facts WHERE submitted_by_user_id = $1',
      [userId],
    ),
  ]);

  const introRequestsByStatus = toLabeledCounts(byStatus.rows);
  const introRequestsMade = introRequestsByStatus.reduce((sum, s) => sum + s.count, 0);
  return {
    introRequestsMade,
    introRequestsByStatus,
    introRequestsMediated: toNumber(mediated.rows[0]?.count),
    insightsSaved: toNumber(insights.rows[0]?.count),
    factsSubmitted: toNumber(facts.rows[0]?.count),
  };
}

function toContextEntries(
  rows: { key: string; value: string; updated_at: string }[],
): UserContextEntry[] {
  return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at }));
}

async function getMemory(userId: number): Promise<UserMemory> {
  const id = String(userId);
  const [profile, privateCtx, nudges, settings] = await Promise.all([
    query<{ key: string; value: string; updated_at: string }>(
      'SELECT key, value, updated_at FROM user_profile_kv WHERE user_id = $1 ORDER BY key',
      [id],
    ),
    query<{ key: string; value: string; updated_at: string }>(
      'SELECT key, value, updated_at FROM user_private_context WHERE user_id = $1 ORDER BY key',
      [id],
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM ai_notification_log WHERE user_id = $1',
      [id],
    ),
    query<{
      frequency_days: number | null;
      last_sent_at: string | null;
      consecutive_no_opens: number | null;
      paused_until: string | null;
      distress_until: string | null;
    }>(
      `SELECT frequency_days, last_sent_at, consecutive_no_opens, paused_until, distress_until
       FROM ai_notification_settings WHERE user_id = $1`,
      [id],
    ),
  ]);

  const s = settings.rows[0];
  return {
    profile: toContextEntries(profile.rows),
    privateContext: toContextEntries(privateCtx.rows),
    nudgesSent: toNumber(nudges.rows[0]?.count),
    notificationFrequencyDays: s?.frequency_days ?? null,
    consecutiveNoOpens: s?.consecutive_no_opens ?? null,
    lastNudgeAt: s?.last_sent_at ?? null,
    pausedUntil: s?.paused_until ?? null,
    distressUntil: s?.distress_until ?? null,
  };
}

async function getDevices(userId: number): Promise<UserDevices> {
  const [devices, push] = await Promise.all([
    query<{
      device_id: string;
      user_agent: string | null;
      ip: string | null;
      request_count: number;
      first_seen: string;
      last_seen: string;
    }>(
      `SELECT device_id, user_agent, ip, request_count, first_seen, last_seen
       FROM device_fingerprints WHERE user_id = $1 ORDER BY last_seen DESC`,
      [String(userId)],
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = $1',
      [userId],
    ),
  ]);

  const deviceList: UserDevice[] = devices.rows.map((r) => ({
    deviceId: r.device_id,
    userAgent: r.user_agent,
    ip: r.ip,
    requestCount: Number(r.request_count),
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));
  return { devices: deviceList, pushSubscriptionsCount: toNumber(push.rows[0]?.count) };
}

export async function getAdminUserDetail(userId: number): Promise<UserProfile | null> {
  const account = await getAccount(userId);
  if (!account) return null;

  const [network, activity, searches, outcomes, memory, devices] = await Promise.all([
    getNetwork(userId),
    getActivity(userId),
    getSearches(userId),
    getOutcomes(userId),
    getMemory(userId),
    getDevices(userId),
  ]);

  return { account, network, activity, searches, outcomes, memory, devices };
}
