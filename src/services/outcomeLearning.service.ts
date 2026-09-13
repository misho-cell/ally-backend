import { query } from '../db/postgres/client';
import type { TargetTier } from './targetTiers';

/**
 * Ticket 19 [43]: the engine learns from what actually happened.
 *
 * Everything the target score knows today is about the PERSON — how many people
 * carry them, what their label says, how rare their name is. Nothing in it
 * reflects the one thing that settles whether the guess was any good: we
 * invited a hundred people this way and three came.
 *
 * So the first thing learned here is the engine's own calibration. Every listed
 * person was given a tier — BEST, GOOD, NOT_YET — which is the engine SAYING
 * how promising it thinks they are. A campaign that has since concluded is the
 * answer to that claim. Grouping concluded campaigns by the tier the engine
 * gave at the time, and comparing each tier's join rate with the overall one,
 * asks exactly the right question: was I right?
 *
 * WHY CALIBRATION AND NOT SOMETHING RICHER. A model over phonebook size, city,
 * label shape and the rest is the obvious next thing and it needs data we do
 * not have. The tier is the engine's own output, so this learns from the
 * smallest honest unit and cannot invent a pattern that is not there.
 *
 * WHAT IT REFUSES TO DO. The founder asked for this built now (13 Sep) while
 * knowing, as I do, that not one campaign has ever ended in a join. So it is
 * built to be correct the day data arrives and inert until then: below the
 * floor a tier's multiplier is exactly 1.0 and the report says why. A learner
 * that moves scores on four outcomes is not learning, it is following noise —
 * and it would move real people up and down a list the founder reads.
 */

const LEARNING_QUERY_TIMEOUT_MS = 8_000;

/** Concluded campaigns a tier needs before its outcome may move any score. */
const MIN_CONCLUDED_PER_TIER = Number(process.env.OUTCOME_LEARNING_MIN_CAMPAIGNS ?? 20);

/**
 * How far one cohort may move a score. A tier that converts twice the average
 * is worth ranking up; it is not worth ten times the weight of everything the
 * score already knows about a person.
 */
const MULTIPLIER_MIN = 0.5;
const MULTIPLIER_MAX = 1.5;

/**
 * One switch back to a score that ignores outcomes entirely. Read at call time,
 * not at import: this runs once per build, so there is no cost, and the switch
 * then means what it says the moment the variable changes.
 */
function learningOff(): boolean {
  return process.env.OUTCOME_LEARNING === 'off';
}

/**
 * A campaign counts as answered once it can no longer become a join. An open
 * campaign is not a failure, it is unfinished, and counting it as a failure is
 * how a learner teaches itself that everything fails.
 */
const CONCLUDED_STATUSES = [
  'closed_joined',
  'closed_declined_all',
  'closed_exhausted',
  'closed_stale_target',
];

export interface TierOutcome {
  readonly tier: TargetTier;
  readonly concluded: number;
  readonly joined: number;
  readonly join_rate: number;
  /** 1.0 until this tier has enough concluded campaigns to have earned a say. */
  readonly multiplier: number;
}

export interface OutcomeLearning {
  readonly tiers: TierOutcome[];
  readonly concluded_total: number;
  readonly joined_total: number;
  /** What may honestly be concluded, in words, for whoever reads the report. */
  readonly verdict: string;
}

interface TierRow {
  tier: string | null;
  concluded: string;
  joined: string;
}

function isTier(value: string | null): value is TargetTier {
  return value === 'BEST' || value === 'GOOD' || value === 'NOT_YET';
}

function clamp(value: number): number {
  return Math.min(MULTIPLIER_MAX, Math.max(MULTIPLIER_MIN, value));
}

/**
 * What each tier's outcomes say, and how much they are allowed to move a score.
 *
 * The join is the whole idea: a campaign's target phone against the score
 * history row that listed that phone, so the tier read here is the one the
 * engine committed to BEFORE the outcome was known. Reading today's tier
 * instead would be marking its own homework after seeing the answer.
 */
export async function outcomeLearning(): Promise<OutcomeLearning> {
  if (learningOff()) {
    return {
      tiers: [],
      concluded_total: 0,
      joined_total: 0,
      verdict: 'Outcome learning is switched off (OUTCOME_LEARNING=off); scores ignore outcomes.',
    };
  }
  const result = await query<TierRow>(
    `WITH listed AS (
       -- The FIRST time the engine listed this phone, and what it claimed then.
       SELECT DISTINCT ON (h.phone)
              h.phone, h.parts->>'tier' AS tier
       FROM target_score_history h
       ORDER BY h.phone, h.built_at ASC
     )
     SELECT l.tier,
            COUNT(*)::text                                            AS concluded,
            COUNT(*) FILTER (WHERE c.status = 'closed_joined')::text  AS joined
     FROM invite_campaigns c
     JOIN listed l ON l.phone = c.target_phone
     WHERE c.status = ANY($1::text[])
     GROUP BY l.tier`,
    [CONCLUDED_STATUSES],
    LEARNING_QUERY_TIMEOUT_MS,
  );

  const rows = result.rows.filter((r) => isTier(r.tier));
  const concludedTotal = rows.reduce((sum, r) => sum + Number(r.concluded), 0);
  const joinedTotal = rows.reduce((sum, r) => sum + Number(r.joined), 0);
  const overallRate = concludedTotal > 0 ? joinedTotal / concludedTotal : 0;

  const tiers: TierOutcome[] = rows.map((row) => {
    const concluded = Number(row.concluded);
    const joined = Number(row.joined);
    const joinRate = concluded > 0 ? joined / concluded : 0;
    // A tier speaks only once it has enough answers, and only when there is an
    // average to compare against. Either missing means it says nothing.
    const earned = concluded >= MIN_CONCLUDED_PER_TIER && overallRate > 0;
    return {
      tier: row.tier as TargetTier,
      concluded,
      joined,
      join_rate: Math.round(joinRate * 1000) / 1000,
      multiplier: earned ? Math.round(clamp(joinRate / overallRate) * 100) / 100 : 1,
    };
  });

  const speaking = tiers.filter((t) => t.multiplier !== 1);
  return {
    tiers,
    concluded_total: concludedTotal,
    joined_total: joinedTotal,
    verdict:
      joinedTotal === 0
        ? `No campaign has ended in a join yet (${concludedTotal} concluded). Nothing can be ` +
          'learned from outcomes that are all the same, so every multiplier is 1.0 and the ' +
          'score is exactly what it was.'
        : speaking.length === 0
          ? `Not enough evidence: no tier has reached ${MIN_CONCLUDED_PER_TIER} concluded ` +
            `campaigns (${concludedTotal} across all tiers). Every multiplier is 1.0.`
          : `${speaking.map((t) => `${t.tier} ${t.multiplier}x`).join(', ')} — from ` +
            `${joinedTotal} joins across ${concludedTotal} concluded campaigns.`,
  };
}

/** The multiplier for one tier, 1.0 whenever outcomes have not earned a say. */
export function multiplierFor(learning: OutcomeLearning, tier: TargetTier): number {
  return learning.tiers.find((t) => t.tier === tier)?.multiplier ?? 1;
}
