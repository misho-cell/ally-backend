import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { getCompositeKeyForUser } from './neo4j.keys';
import {
  BlockDiagnostic,
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
  UserCosts,
  UserProfile,
  UserWallet,
  UserSearches,
  UserTimelineEvent,
} from '../types';

const TREND_WINDOW_DAYS = 30;
const RECENT_SEARCH_LIMIT = 10;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const NEO4J_TIMEOUT_MS = 10_000;
// Per-user reads can scan large tables (UserAlias, conversations), so give them
// more headroom than the 5s default used for light user-facing queries.
const PROFILE_QUERY_TIMEOUT_MS = 15_000;
// subscription_status values that count as an active paying/trialing subscriber.
const SUBSCRIBED_STATUSES = ['active', 'trialing'];

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

// Postgres returns timestamp columns as JS Date objects; normalise to an ISO
// string so timeline events can be compared/sorted as strings.
function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
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

export async function listUsers(
  rawQuery: string,
  rawLimit: number,
  subscribedOnly: boolean,
): Promise<UserListItem[]> {
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
       AND (NOT $4 OR u.subscription_status = ANY($5))
     ORDER BY u."createdAt" DESC NULLS LAST
     LIMIT $3`,
    [q, like, limit, subscribedOnly, SUBSCRIBED_STATUSES],
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
  const [userResult, phoneResult, inviterResult, invitedResult] = await Promise.all([
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
      PROFILE_QUERY_TIMEOUT_MS,
    ),
    query<{ phone: string }>(
      'SELECT phone FROM "UserPhone" WHERE "userId" = $1 ORDER BY phone',
      [userId],
      PROFILE_QUERY_TIMEOUT_MS,
    ),
    query<{ id: number; name: string | null }>(
      `SELECT inviter.id, inviter.name
       FROM "User" me
       JOIN "User" inviter ON inviter.id = me."inviterReferralUserId"
       WHERE me.id = $1`,
      [userId],
      PROFILE_QUERY_TIMEOUT_MS,
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM "User" WHERE "inviterReferralUserId" = $1 AND "deletedAt" IS NULL',
      [userId],
      PROFILE_QUERY_TIMEOUT_MS,
    ),
  ]);

  const u = userResult.rows[0];
  if (!u) return null;

  const inviter = inviterResult.rows[0];

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
    invitedBy: inviter ? { id: Number(inviter.id), name: inviter.name } : null,
    invitedCount: toNumber(invitedResult.rows[0]?.count),
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

async function countWhere(sql: string, userId: number): Promise<number> {
  const result = await query<{ count: string }>(sql, [userId], PROFILE_QUERY_TIMEOUT_MS);
  return toNumber(result.rows[0]?.count);
}

async function getNetwork(userId: number): Promise<UserNetwork> {
  // Separate statements (each its own timeout) so the large UserAlias/UserTags
  // scans don't share one budget and time out the way a bundled query would.
  const [contacts, tags, blocked, deceased, reach] = await Promise.all([
    countWhere('SELECT COUNT(*) AS count FROM "UserAlias" WHERE "contactId" = $1', userId),
    countWhere('SELECT COUNT(*) AS count FROM "UserTags" WHERE "contactId" = $1', userId),
    countWhere('SELECT COUNT(*) AS count FROM "UserBlock" WHERE "blockerId" = $1', userId),
    countWhere('SELECT COUNT(*) AS count FROM "ContactDeceased" WHERE "userId" = $1', userId),
    getNeo4jReach(userId),
  ]);

  return {
    contactsCount: contacts,
    tagsCount: tags,
    blockedCount: blocked,
    deceasedCount: deceased,
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
      PROFILE_QUERY_TIMEOUT_MS,
    ),
    query<{ day: string; count: string }>(
      `SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
       FROM conversations
       WHERE user_id = $1 AND (kind IS NULL OR kind <> 'step')
         AND created_at > NOW() - ($2 || ' days')::INTERVAL
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`,
      [userId, TREND_WINDOW_DAYS],
      PROFILE_QUERY_TIMEOUT_MS,
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
    query<{ total: string; flagged: string; successful: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE flagged)           AS flagged,
              COUNT(*) FILTER (WHERE result_count > 0)  AS successful
       FROM search_activity WHERE user_id = $1`,
      [id],
    ),
    query<{ label: string | null; count: string }>(
      `SELECT tool AS label, COUNT(*) AS count
       FROM search_activity WHERE user_id = $1
       GROUP BY tool ORDER BY COUNT(*) DESC`,
      [id],
    ),
    query<{
      query: string;
      tool: string | null;
      flagged: boolean;
      result_count: number | null;
      created_at: string;
    }>(
      `SELECT query, tool, flagged, result_count, created_at
       FROM search_activity WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [id, RECENT_SEARCH_LIMIT],
    ),
  ]);

  const recentSearches: RecentSearch[] = recent.rows.map((r) => ({
    query: r.query,
    tool: r.tool,
    flagged: r.flagged,
    resultCount: r.result_count,
    createdAt: r.created_at,
  }));
  return {
    totalSearches: toNumber(totals.rows[0]?.total),
    byType: toLabeledCounts(byType.rows),
    flaggedCount: toNumber(totals.rows[0]?.flagged),
    successfulSearches: toNumber(totals.rows[0]?.successful),
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

async function getTimeline(userId: number): Promise<UserTimelineEvent[]> {
  const id = String(userId);
  const result = await query<{
    signup: string | null;
    first_search: string | null;
    first_intro: string | null;
    first_nudge: string | null;
    last_active: string | null;
  }>(
    `SELECT
       (SELECT "createdAt" FROM "User" WHERE id = $1)                                   AS signup,
       (SELECT MIN(created_at) FROM search_activity WHERE user_id = $2)                 AS first_search,
       (SELECT MIN(created_at) FROM introduction_requests WHERE requester_user_id = $1) AS first_intro,
       (SELECT MIN(created_at) FROM ai_notification_log WHERE user_id = $2)             AS first_nudge,
       (SELECT MAX(created_at) FROM conversations
          WHERE user_id = $1 AND (kind IS NULL OR kind <> 'step'))                      AS last_active`,
    [userId, id],
    PROFILE_QUERY_TIMEOUT_MS,
  );

  const row = result.rows[0];
  const candidates: { type: UserTimelineEvent['type']; at: string | null }[] = [
    { type: 'signup', at: toIso(row?.signup) },
    { type: 'first_search', at: toIso(row?.first_search) },
    { type: 'first_intro_request', at: toIso(row?.first_intro) },
    { type: 'first_nudge', at: toIso(row?.first_nudge) },
    { type: 'last_active', at: toIso(row?.last_active) },
  ];

  return candidates
    .filter((e): e is { type: UserTimelineEvent['type']; at: string } => e.at !== null)
    .map((e) => ({ type: e.type, at: e.at }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

async function getCosts(userId: number): Promise<UserCosts> {
  const id = String(userId);
  const [totals, byKind] = await Promise.all([
    query<{ last30d: string | null; total: string | null }>(
      `SELECT SUM(cost_usd) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last30d,
              SUM(cost_usd)                                                        AS total
       FROM usage_events WHERE user_id = $1`,
      [id],
      PROFILE_QUERY_TIMEOUT_MS,
    ),
    query<{ label: string; total: string }>(
      `SELECT kind AS label, SUM(cost_usd) AS total
       FROM usage_events
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY kind ORDER BY SUM(cost_usd) DESC`,
      [id],
      PROFILE_QUERY_TIMEOUT_MS,
    ),
  ]);

  return {
    last30dUsd: toNumber(totals.rows[0]?.last30d),
    totalUsd: toNumber(totals.rows[0]?.total),
    byKind: byKind.rows.map((r) => ({ label: r.label, costUsd: toNumber(r.total) })),
  };
}

const EMPTY_COSTS: UserCosts = { last30dUsd: 0, totalUsd: 0, byKind: [] };
const EMPTY_WALLET: UserWallet = { balance: 0, grantedThisMonth: 0, spentThisMonth: 0 };

async function getWallet(userId: number): Promise<UserWallet> {
  const result = await query<{
    balance: string | null;
    granted: string | null;
    spent: string | null;
  }>(
    `SELECT SUM(amount) AS balance,
            SUM(amount) FILTER (WHERE amount > 0
              AND created_at >= date_trunc('month', NOW())) AS granted,
            -SUM(amount) FILTER (WHERE amount < 0
              AND created_at >= date_trunc('month', NOW())) AS spent
     FROM token_transactions
     WHERE user_id = $1`,
    [String(userId)],
    PROFILE_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    balance: toNumber(row?.balance),
    grantedThisMonth: toNumber(row?.granted),
    spentThisMonth: toNumber(row?.spent),
  };
}

const EMPTY_NETWORK: UserNetwork = {
  contactsCount: 0,
  tagsCount: 0,
  blockedCount: 0,
  deceasedCount: 0,
  firstDegree: null,
  secondDegree: null,
};
const EMPTY_ACTIVITY: UserActivity = {
  threadsCount: 0,
  messageCount: 0,
  firstActivityAt: null,
  lastActivityAt: null,
  activityByDay: [],
};
const EMPTY_SEARCHES: UserSearches = {
  totalSearches: 0,
  byType: [],
  flaggedCount: 0,
  successfulSearches: 0,
  recent: [],
};
const EMPTY_OUTCOMES: UserOutcomes = {
  introRequestsMade: 0,
  introRequestsByStatus: [],
  introRequestsMediated: 0,
  insightsSaved: 0,
  factsSubmitted: 0,
};
const EMPTY_MEMORY: UserMemory = {
  profile: [],
  privateContext: [],
  nudgesSent: 0,
  notificationFrequencyDays: null,
  consecutiveNoOpens: null,
  lastNudgeAt: null,
  pausedUntil: null,
  distressUntil: null,
};
const EMPTY_DEVICES: UserDevices = { devices: [], pushSubscriptionsCount: 0 };

// Isolate a block so a single failing query degrades it to its empty shape and
// records the reason, instead of failing the whole profile request.
async function runBlock<T>(
  block: string,
  fn: () => Promise<T>,
  fallback: T,
  diagnostics: BlockDiagnostic[],
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // eslint-disable-next-line no-console
    console.error(`[user-profile] block "${block}" failed:`, message);
    diagnostics.push({ block, message });
    return fallback;
  }
}

export async function getAdminUserDetail(userId: number): Promise<UserProfile | null> {
  // The account is the gate: if the user does not exist we 404, and an account
  // query failure is a genuine 500 (it is cheap and essential).
  const account = await getAccount(userId);
  if (!account) return null;

  const diagnostics: BlockDiagnostic[] = [];
  const [network, activity, searches, outcomes, memory, devices, costs, wallet, timeline] =
    await Promise.all([
      runBlock('network', () => getNetwork(userId), EMPTY_NETWORK, diagnostics),
      runBlock('activity', () => getActivity(userId), EMPTY_ACTIVITY, diagnostics),
      runBlock('searches', () => getSearches(userId), EMPTY_SEARCHES, diagnostics),
      runBlock('outcomes', () => getOutcomes(userId), EMPTY_OUTCOMES, diagnostics),
      runBlock('memory', () => getMemory(userId), EMPTY_MEMORY, diagnostics),
      runBlock('devices', () => getDevices(userId), EMPTY_DEVICES, diagnostics),
      runBlock('costs', () => getCosts(userId), EMPTY_COSTS, diagnostics),
      runBlock('wallet', () => getWallet(userId), EMPTY_WALLET, diagnostics),
      runBlock('timeline', () => getTimeline(userId), [] as UserTimelineEvent[], diagnostics),
    ]);

  const profile: UserProfile = {
    account,
    network,
    activity,
    searches,
    outcomes,
    memory,
    devices,
    costs,
    wallet,
    timeline,
  };
  if (diagnostics.length > 0) profile.diagnostics = diagnostics;
  return profile;
}
