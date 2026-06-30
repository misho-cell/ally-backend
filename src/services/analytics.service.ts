import { query } from '../db/postgres/client';
import {
  ActivationFunnel,
  AnalyticsBlockError,
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

async function countScalar(sql: string): Promise<number> {
  const result = await query<{ count: string }>(sql, [], ANALYTICS_QUERY_TIMEOUT_MS);
  return toNumber(result.rows[0]?.count);
}

async function getActivationFunnel(): Promise<ActivationFunnel> {
  // Each step is its own statement with its own timeout. Bundling all five into
  // one statement made the heavy "UserAlias" distinct-count share a single
  // budget with the others and time out on large data sets.
  const [signedUp, imported, searched, requestedIntro, subscribed] = await Promise.all([
    countScalar('SELECT COUNT(*) AS count FROM "User"'),
    countScalar('SELECT COUNT(DISTINCT "contactId") AS count FROM "UserAlias"'),
    countScalar('SELECT COUNT(DISTINCT user_id) AS count FROM search_activity'),
    countScalar('SELECT COUNT(DISTINCT requester_user_id) AS count FROM introduction_requests'),
    countScalar(
      `SELECT COUNT(*) AS count FROM "User" WHERE subscription_status IN ('active', 'trialing')`,
    ),
  ]);

  return {
    steps: [
      { step: 'signed_up', users: signedUp },
      { step: 'imported_contacts', users: imported },
      { step: 'searched', users: searched },
      { step: 'requested_intro', users: requestedIntro },
      { step: 'subscribed', users: subscribed },
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

const EMPTY_GROWTH: GrowthMetrics = { totalUsers: 0, newUsersByDay: [] };
const EMPTY_RETENTION: RetentionMetrics = { dau: 0, wau: 0, mau: 0, activeUsersByDay: [] };
const EMPTY_FUNNEL: ActivationFunnel = { steps: [] };
const EMPTY_USAGE: CoreUsageMetrics = {
  searchesByType: [],
  totalSearches: 0,
  introsByStatus: [],
  avgNetworkSize: 0,
  factsCount: 0,
  insightsCount: 0,
};

// Run one block in isolation so a single failing query degrades that block to
// its empty shape and records the reason, instead of failing the whole report.
async function runBlock<T>(
  block: string,
  fn: () => Promise<T>,
  fallback: T,
  diagnostics: AnalyticsBlockError[],
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // eslint-disable-next-line no-console
    console.error(`[analytics] block "${block}" failed:`, message);
    diagnostics.push({ block, message });
    return fallback;
  }
}

export async function getOverview(): Promise<AnalyticsOverview> {
  const diagnostics: AnalyticsBlockError[] = [];

  const [growth, retention, funnel, usage] = await Promise.all([
    runBlock('growth', getGrowth, EMPTY_GROWTH, diagnostics),
    runBlock('retention', getRetention, EMPTY_RETENTION, diagnostics),
    runBlock('funnel', getActivationFunnel, EMPTY_FUNNEL, diagnostics),
    runBlock('usage', getCoreUsage, EMPTY_USAGE, diagnostics),
  ]);

  const overview: AnalyticsOverview = { growth, retention, funnel, usage };
  if (diagnostics.length > 0) {
    overview.diagnostics = diagnostics;
  }
  return overview;
}
