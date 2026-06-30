import { query } from '../db/postgres/client';
import {
  ActivationFunnel,
  AnalyticsOverview,
  CoreUsageMetrics,
  DailyCount,
  GrowthMetrics,
  LabeledCount,
  RetentionMetrics,
} from '../types';

// Reporting aggregations scan whole tables, so they need more headroom than
// the default per-query timeout used for user-facing requests.
const ANALYTICS_QUERY_TIMEOUT_MS = 15_000;
// How many trailing days the time-series charts (growth, active users) cover.
const TREND_WINDOW_DAYS = 30;

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function toDailyCounts(rows: { day: string; count: string | number }[]): DailyCount[] {
  return rows.map((r) => ({ day: r.day, count: toNumber(r.count) }));
}

async function getGrowth(): Promise<GrowthMetrics> {
  const [totalResult, byDayResult] = await Promise.all([
    query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM "User"',
      [],
      ANALYTICS_QUERY_TIMEOUT_MS,
    ),
    query<{ day: string; count: string }>(
      `SELECT TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') AS day, COUNT(*) AS count
       FROM "User"
       WHERE "createdAt" > NOW() - ($1 || ' days')::INTERVAL
       GROUP BY DATE("createdAt")
       ORDER BY DATE("createdAt")`,
      [TREND_WINDOW_DAYS],
      ANALYTICS_QUERY_TIMEOUT_MS,
    ),
  ]);

  return {
    totalUsers: toNumber(totalResult.rows[0]?.count),
    newUsersByDay: toDailyCounts(byDayResult.rows),
  };
}

async function getRetention(): Promise<RetentionMetrics> {
  const [activeResult, byDayResult] = await Promise.all([
    query<{ dau: string; wau: string; mau: string }>(
      `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')   AS dau,
         COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS wau,
         COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS mau
       FROM conversations`,
      [],
      ANALYTICS_QUERY_TIMEOUT_MS,
    ),
    query<{ day: string; count: string }>(
      `SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day, COUNT(DISTINCT user_id) AS count
       FROM conversations
       WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`,
      [TREND_WINDOW_DAYS],
      ANALYTICS_QUERY_TIMEOUT_MS,
    ),
  ]);

  const row = activeResult.rows[0];
  return {
    dau: toNumber(row?.dau),
    wau: toNumber(row?.wau),
    mau: toNumber(row?.mau),
    activeUsersByDay: toDailyCounts(byDayResult.rows),
  };
}

async function getActivationFunnel(): Promise<ActivationFunnel> {
  const result = await query<{
    signed_up: string;
    imported: string;
    searched: string;
    requested_intro: string;
    subscribed: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM "User")                                               AS signed_up,
       (SELECT COUNT(DISTINCT "contactId") FROM "UserAlias")                       AS imported,
       (SELECT COUNT(DISTINCT user_id) FROM search_activity)                       AS searched,
       (SELECT COUNT(DISTINCT requester_user_id) FROM introduction_requests)       AS requested_intro,
       (SELECT COUNT(*) FROM "User"
          WHERE subscription_status IN ('active', 'trialing'))                     AS subscribed`,
    [],
    ANALYTICS_QUERY_TIMEOUT_MS,
  );

  const row = result.rows[0];
  return {
    steps: [
      { step: 'signed_up', users: toNumber(row?.signed_up) },
      { step: 'imported_contacts', users: toNumber(row?.imported) },
      { step: 'searched', users: toNumber(row?.searched) },
      { step: 'requested_intro', users: toNumber(row?.requested_intro) },
      { step: 'subscribed', users: toNumber(row?.subscribed) },
    ],
  };
}

function toLabeledCounts(rows: { label: string | null; count: string | number }[]): LabeledCount[] {
  return rows.map((r) => ({ label: r.label ?? 'unknown', count: toNumber(r.count) }));
}

async function getCoreUsage(): Promise<CoreUsageMetrics> {
  const [searchesResult, introsResult, networkResult, factsResult, insightsResult] =
    await Promise.all([
      query<{ label: string | null; count: string }>(
        `SELECT tool AS label, COUNT(*) AS count
         FROM search_activity
         GROUP BY tool
         ORDER BY COUNT(*) DESC`,
        [],
        ANALYTICS_QUERY_TIMEOUT_MS,
      ),
      query<{ label: string | null; count: string }>(
        `SELECT status AS label, COUNT(*) AS count
         FROM introduction_requests
         GROUP BY status
         ORDER BY COUNT(*) DESC`,
        [],
        ANALYTICS_QUERY_TIMEOUT_MS,
      ),
      query<{ avg: string | null }>(
        `SELECT AVG(cnt) AS avg
         FROM (SELECT COUNT(*) AS cnt FROM "UserAlias" GROUP BY "contactId") AS per_user`,
        [],
        ANALYTICS_QUERY_TIMEOUT_MS,
      ),
      query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM contact_facts',
        [],
        ANALYTICS_QUERY_TIMEOUT_MS,
      ),
      query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM contact_insights',
        [],
        ANALYTICS_QUERY_TIMEOUT_MS,
      ),
    ]);

  const searchesByType = toLabeledCounts(searchesResult.rows);
  const totalSearches = searchesByType.reduce((sum, s) => sum + s.count, 0);

  return {
    searchesByType,
    totalSearches,
    introsByStatus: toLabeledCounts(introsResult.rows),
    avgNetworkSize: Math.round(toNumber(networkResult.rows[0]?.avg)),
    factsCount: toNumber(factsResult.rows[0]?.count),
    insightsCount: toNumber(insightsResult.rows[0]?.count),
  };
}

export async function getOverview(): Promise<AnalyticsOverview> {
  const [growth, retention, funnel, usage] = await Promise.all([
    getGrowth(),
    getRetention(),
    getActivationFunnel(),
    getCoreUsage(),
  ]);

  return { growth, retention, funnel, usage };
}
