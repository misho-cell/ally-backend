import { query } from '../db/postgres/client';

/**
 * ROW 301 — TORNIKE, 1 OCTOBER: „Yes, with the 5-a-day cap." Chorus restarts
 * only with the cap in the code FIRST — campaigns per day and people per
 * campaign — and never the restart alone.
 *
 * Why the cap sits on the SENDS and not only on opening: Chorus has no off
 * switch. It is held because no target is approved, and 47 open campaigns with
 * ~85 overdue asks are already queued. Approving targets would release every
 * one of them on the next 15-minute tick. A cap on new campaigns alone would
 * have let that backlog through untouched.
 *
 * Both numbers are config, not deploys: „raised later" is an env change.
 */
const QUERY_TIMEOUT_MS = 5_000;
const DEFAULT_CAMPAIGNS_PER_DAY = 5;
/** The starting dial's default — the most a fresh campaign was ever meant to ask. */
const DEFAULT_PEOPLE_PER_CAMPAIGN = 8;
/** The day a person lives in, not the server's. */
const DAY_ZONE = 'Asia/Tbilisi';
const START_OF_TODAY_SQL = `(date_trunc('day', NOW() AT TIME ZONE '${DAY_ZONE}') AT TIME ZONE '${DAY_ZONE}')`;

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function campaignsPerDay(): number {
  return positiveIntFromEnv(process.env.CHORUS_CAMPAIGNS_PER_DAY, DEFAULT_CAMPAIGNS_PER_DAY);
}

export function peoplePerCampaign(): number {
  return positiveIntFromEnv(
    process.env.CHORUS_MAX_PEOPLE_PER_CAMPAIGN,
    DEFAULT_PEOPLE_PER_CAMPAIGN,
  );
}

/** The campaigns that have already sent an ask today — each still counts once. */
export async function campaignsThatSentToday(): Promise<Set<number>> {
  const result = await query<{ campaign_id: number }>(
    `SELECT DISTINCT campaign_id FROM invite_campaign_participants
      WHERE asked_at >= ${START_OF_TODAY_SQL}
      LIMIT 1000`,
    [],
    QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => Number(r.campaign_id)));
}

/** How many campaigns were opened today. */
export async function campaignsOpenedToday(): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM invite_campaigns WHERE opened_at >= ${START_OF_TODAY_SQL}`,
    [],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.n ?? 0);
}

/**
 * The rows that may send now: a campaign already sending today keeps its
 * place; a new one gets in only while today's count is under the cap. Oldest
 * first, as the rows arrive. `sentToday` is not changed.
 */
export function withinDailyCampaignCap<T extends { campaign_id: number }>(
  rows: readonly T[],
  sentToday: ReadonlySet<number>,
  cap: number,
): T[] {
  const sending = new Set(sentToday);
  return rows.filter((row) => {
    if (sending.has(row.campaign_id)) return true;
    if (sending.size >= cap) return false;
    sending.add(row.campaign_id);
    return true;
  });
}
