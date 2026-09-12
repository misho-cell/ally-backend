import { query } from '../db/postgres/client';
import { getReferralFunnel, ReferralFunnel } from './referralLink.service';
import {
  MONTHLY_GROWTH_ASK_BUDGET_BASE,
  MONTHLY_GROWTH_ASK_BUDGET_LADDER,
  FATIGUE_STEP_DOWN_PER_SIGNAL,
  FATIGUE_WINDOW_DAYS,
  MIN_MONTHLY_ASK_BUDGET,
} from './askBudget.service';
import { roundTo } from './number';

const REPORT_QUERY_TIMEOUT_MS = 8_000;

/** The Monday (UTC) that starts the current calendar week — this report's own week key. */
export function currentWeekStartISO(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday),
  );
  return monday.toISOString().slice(0, 10);
}
const IGNORED_ASK_AFTER_HOURS = 168; // mirrors askBudget.service's own fatigue window

// T16: "the weekly Lab report — reads everything." Of the spec's eight
// components, seven are built here from data that genuinely exists
// (technique conversion joined in ticket 7 task 14 once D50 put the tag on
// invite_campaign_participants; curiosity answer rate once the surfacing log
// existed). One is NOT built, and is not faked with invented numbers:
//   - "facts-used rate" — no search tool records which stored fact, if any,
//     changed its result; that would need new instrumentation across every
//     search path, out of scope for this report to retrofit silently.

export interface AskDialRow {
  ask_count_dial: number;
  city: string | null;
  campaigns: number;
  joins: number;
  join_rate: number;
}

/**
 * A technique value as a reader should see it.
 *
 * 0 is a real, deliberate answer — "there was no such thing", stored by
 * migration 097 so an absent technique is distinguishable from an unrecorded
 * one. Printed as a bare 0 next to counts it reads as "zero asks", which is
 * exactly how the 2 September report was misread.
 */
function techniqueLabel(value: number | null): string {
  if (value === null) return 'unknown';
  if (value === 0) return 'none';
  return String(value);
}

/** Component 1: campaigns per dial setting (and city) -> joins -> join rate. */
async function buildAskDialTable(): Promise<AskDialRow[]> {
  const result = await query<{
    ask_count_dial: number;
    city: string | null;
    campaigns: string;
    joins: string;
  }>(
    `SELECT ask_count_dial, city,
            COUNT(*) AS campaigns,
            COUNT(*) FILTER (WHERE status = 'closed_joined') AS joins
     FROM invite_campaigns
     WHERE status != 'open'
     GROUP BY ask_count_dial, city
     ORDER BY ask_count_dial`,
    [],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    ask_count_dial: r.ask_count_dial,
    city: r.city,
    campaigns: Number(r.campaigns),
    joins: Number(r.joins),
    join_rate: roundTo(Number(r.campaigns) > 0 ? Number(r.joins) / Number(r.campaigns) : 0),
  }));
}

export interface SpacingRow {
  day_offset: number;
  asked: number;
  joined: number;
  join_rate: number;
}

/**
 * Component 3 ("spacing test results"), honestly scoped: there is no A/B
 * variant tracking — day-spacing has only ever had one live config — so this
 * is not a real experiment comparison. What IS real and useful: which
 * SCHEDULED POSITION within a campaign (day 1, day 4, day 7...) actually
 * converts, computed straight from asked_at vs. the campaign's own opened_at.
 */
async function buildSpacingResults(): Promise<SpacingRow[]> {
  const result = await query<{ day_offset: string; asked: string; joined: string }>(
    `SELECT
       FLOOR(EXTRACT(EPOCH FROM (p.asked_at - c.opened_at)) / 86400) AS day_offset,
       COUNT(*) AS asked,
       COUNT(*) FILTER (WHERE p.state = 'joined') AS joined
     FROM invite_campaign_participants p
     JOIN invite_campaigns c ON c.id = p.campaign_id
     WHERE p.asked_at IS NOT NULL
     GROUP BY day_offset
     ORDER BY day_offset`,
    [],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    day_offset: Number(r.day_offset),
    asked: Number(r.asked),
    joined: Number(r.joined),
    join_rate: roundTo(Number(r.asked) > 0 ? Number(r.joined) / Number(r.asked) : 0),
  }));
}

export interface TechniqueConversionRow {
  technique_when: number | null;
  technique_how: number | null;
  technique_reason: number | null;
  /** The same three, printed: a technique number, `none`, or `unknown`. */
  technique_when_label: string;
  technique_how_label: string;
  technique_reason_label: string;
  asked: number;
  agreed: number;
  told: number;
  joined: number;
  /**
   * Ticket 17 Task 43. The same four counts, but only over asks sent SINCE the
   * four phrasings existed side by side — the only rows that are evidence
   * about a phrasing rather than about the past.
   */
  measured_asked: number;
  measured_agreed: number;
  measured_told: number;
  measured_joined: number;
}

export interface TechniqueConversion {
  rows: TechniqueConversionRow[];
  /** When the phrasings first ran against each other. Null before they did. */
  measured_since: string | null;
  /** Total asks that count as evidence, across every phrasing. */
  measured_total: number;
  /**
   * What may honestly be concluded. Never a winner on a handful of asks —
   * the engine is allowed to learn only when this says it can.
   */
  verdict: string;
}

/**
 * Below this many measured asks, no phrasing may be called better than
 * another. Thirteen asks across four variants with one agreement between them
 * is not a result; it is four coin flips.
 */
const MIN_ASKS_TO_CONCLUDE = Number(process.env.TECHNIQUE_MIN_ASKS ?? 100);

/**
 * Component 2 (D50, ticket 7 task 14): asks -> agreed -> told -> joined per
 * technique tag, straight off the columns Chorus stamps and the assistant
 * reports. Counts are CURRENT states of asked participants (the funnel's
 * live distribution); NULL in any group means "unknown" and is its own row —
 * allowed but counted, per the ruling, never folded into a guessed value.
 */
async function buildTechniqueConversion(): Promise<TechniqueConversion> {
  const result = await query<{
    technique_when: number | null;
    technique_how: number | null;
    technique_reason: number | null;
    asked: string;
    agreed: string;
    told: string;
    joined: string;
    measured_asked: string;
    measured_agreed: string;
    measured_told: string;
    measured_joined: string;
    measured_since: string | null;
  }>(
    // Ticket 17 Task 43, read live on 12 September. The all-time table says
    // phrasing 5 converted 0 of 31 with 28 declines, and every other phrasing
    // 0 declines — which reads as a verdict and is not one. Phrasings 6, 7 and
    // 8 first went out on 4 September; 27 of phrasing 5's 31 asks predate that
    // day, because 5 is also the fallback every older ask was tagged with.
    // An engine reading this table would learn something false about a
    // phrasing from a period in which it had no rivals.
    //
    // `since` is derived, not a hardcoded date: the first moment an ask went
    // out under any phrasing other than the fallback is the moment the four
    // began to compete. Before that there is nothing to compare.
    `WITH since AS (
       SELECT MIN(asked_at) AS at FROM invite_campaign_participants
       WHERE asked_at IS NOT NULL AND technique_how IS NOT NULL AND technique_how <> 5
     )
     SELECT p.technique_when, p.technique_how, p.technique_reason,
            COUNT(*) AS asked,
            COUNT(*) FILTER (WHERE p.state IN ('agreed', 'told')) AS agreed,
            COUNT(*) FILTER (WHERE p.state = 'told') AS told,
            COUNT(*) FILTER (WHERE p.state = 'joined') AS joined,
            COUNT(*) FILTER (WHERE p.asked_at >= s.at) AS measured_asked,
            COUNT(*) FILTER (WHERE p.asked_at >= s.at
                             AND p.state IN ('agreed', 'told')) AS measured_agreed,
            COUNT(*) FILTER (WHERE p.asked_at >= s.at AND p.state = 'told') AS measured_told,
            COUNT(*) FILTER (WHERE p.asked_at >= s.at AND p.state = 'joined') AS measured_joined,
            MAX(s.at)::text AS measured_since
     FROM invite_campaign_participants p, since s
     WHERE p.asked_at IS NOT NULL
     GROUP BY p.technique_when, p.technique_how, p.technique_reason
     ORDER BY joined DESC, asked DESC`,
    [],
    REPORT_QUERY_TIMEOUT_MS,
  );
  const rows = result.rows.map((r) => ({
    technique_when: r.technique_when,
    technique_how: r.technique_how,
    technique_reason: r.technique_reason,
    // Ticket 9 task 22: the STORED 0 means "explicitly none" and the row was
    // read as a zero count — „technique_when 0 · technique_reason 0" in the
    // 2 September report, when both were values on five real asks. A number
    // that means a word should be printed as the word.
    technique_when_label: techniqueLabel(r.technique_when),
    technique_how_label: techniqueLabel(r.technique_how),
    technique_reason_label: techniqueLabel(r.technique_reason),
    asked: Number(r.asked),
    agreed: Number(r.agreed),
    told: Number(r.told),
    joined: Number(r.joined),
    measured_asked: Number(r.measured_asked),
    measured_agreed: Number(r.measured_agreed),
    measured_told: Number(r.measured_told),
    measured_joined: Number(r.measured_joined),
  }));
  const measuredSince = result.rows[0]?.measured_since ?? null;
  const measuredTotal = rows.reduce((sum, r) => sum + r.measured_asked, 0);
  return {
    rows,
    measured_since: measuredSince,
    measured_total: measuredTotal,
    verdict:
      measuredSince === null
        ? 'Only one phrasing has ever gone out. Nothing to compare; no phrasing may be preferred.'
        : measuredTotal < MIN_ASKS_TO_CONCLUDE
          ? `Not enough evidence: ${measuredTotal} asks have gone out since the phrasings began ` +
            `competing, and ${MIN_ASKS_TO_CONCLUDE} is the floor. Read the all-time columns as ` +
            `history, never as a verdict — most of them were stamped with the fallback phrasing ` +
            `before the others existed. No phrasing may be preferred yet.`
          : `${measuredTotal} measured asks — enough to compare. Read the measured_ columns only.`,
  };
}

export interface FatigueDistributionBucket {
  fatigue_signals: number;
  users: number;
}

export interface BudgetsLadderState {
  monthly_budget_base: number;
  monthly_budget_ladder: number;
  effective_monthly_budget: number;
  fatigue_step_down_per_signal: number;
  fatigue_window_days: number;
  min_monthly_budget: number;
  fatigue_distribution: FatigueDistributionBucket[];
}

/**
 * Component 5: the live ladder config plus how fatigue signals are distributed
 * across active users.
 *
 * The distribution counts exactly what the budget counts (ticket 9 task 17) —
 * opt-outs this sender CAUSED and this sender's own ignored asks, both inside
 * the window. It used to count every user's own „stop asking me" rows, for
 * ever, which is how this screen came to show one user at six signals while
 * the budget behind it was a different number from a different rule.
 */
async function buildBudgetsLadderState(): Promise<BudgetsLadderState> {
  const result = await query<{ fatigue_signals: string; users: string }>(
    `SELECT fatigue_signals, COUNT(*) AS users FROM (
       SELECT u.id,
         COALESCE(caused.cnt, 0) + COALESCE(ignored.cnt, 0) AS fatigue_signals
       FROM "User" u
       LEFT JOIN (
         SELECT ta.from_user_id, COUNT(DISTINCT e.user_id) AS cnt
         FROM ask_optout_events e
         JOIN task_asks ta ON ta.to_user_id = e.user_id
           AND ta.created_at <= e.created_at
           AND ta.created_at > e.created_at - INTERVAL '7 days'
         WHERE e.action = 'opt_out'
           AND e.created_at > NOW() - ($1 || ' days')::INTERVAL
           AND NOT EXISTS (
             SELECT 1 FROM ask_optout_events r
             WHERE r.user_id = e.user_id AND r.action = 'resume' AND r.created_at > e.created_at
           )
         GROUP BY ta.from_user_id
       ) caused ON caused.from_user_id = u.id
       LEFT JOIN (
         SELECT from_user_id, COUNT(*) AS cnt FROM task_asks
         WHERE status = 'sent' AND created_at < NOW() - INTERVAL '${IGNORED_ASK_AFTER_HOURS} hours'
           AND created_at > NOW() - ($1 || ' days')::INTERVAL
         GROUP BY from_user_id
       ) ignored ON ignored.from_user_id = u.id
       WHERE u.subscription_status = 'active'
     ) x
     GROUP BY fatigue_signals
     ORDER BY fatigue_signals`,
    [FATIGUE_WINDOW_DAYS],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return {
    monthly_budget_base: MONTHLY_GROWTH_ASK_BUDGET_BASE,
    monthly_budget_ladder: MONTHLY_GROWTH_ASK_BUDGET_LADDER,
    effective_monthly_budget: MONTHLY_GROWTH_ASK_BUDGET_BASE * MONTHLY_GROWTH_ASK_BUDGET_LADDER,
    fatigue_step_down_per_signal: FATIGUE_STEP_DOWN_PER_SIGNAL,
    fatigue_window_days: FATIGUE_WINDOW_DAYS,
    min_monthly_budget: MIN_MONTHLY_ASK_BUDGET,
    fatigue_distribution: result.rows.map((r) => ({
      fatigue_signals: Number(r.fatigue_signals),
      users: Number(r.users),
    })),
  };
}

export interface FactsPerWeekRow {
  week: string;
  source: string | null;
  facts: number;
  users: number;
}

const FACTS_LOOKBACK_WEEKS = 12;

/**
 * Component 6, with an honest gap: contact_facts.source is one of
 * chat/sweep/label/debrief — there is no distinct "asked" stream. A fact a
 * user gives in answer to a T11 curiosity question is saved through the same
 * save_contact_fact path as any other stated fact and lands under 'chat',
 * indistinguishable from it. Reported under the source that actually exists.
 */
async function buildFactsPerWeek(): Promise<FactsPerWeekRow[]> {
  const result = await query<{ week: string; source: string | null; facts: string; users: string }>(
    `SELECT date_trunc('week', created_at) AS week, source,
            COUNT(*) AS facts, COUNT(DISTINCT submitted_by_user_id) AS users
     FROM contact_facts
     WHERE created_at > NOW() - INTERVAL '${FACTS_LOOKBACK_WEEKS} weeks'
     GROUP BY week, source
     ORDER BY week DESC`,
    [],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    week: r.week,
    source: r.source,
    facts: Number(r.facts),
    users: Number(r.users),
  }));
}

export interface CuriosityAnswerRate {
  surfaced: number;
  answered: number;
  answer_rate: number;
}

const CURIOSITY_LOOKBACK_DAYS = 30;

/**
 * Component 7, now buildable: curiosity_surfacing_log records every item
 * get_curiosity_queue ever returned. "Answered" means the exact missing
 * fact it named was later actually saved for that phone by that user — the
 * same (phone, submitted_by_user_id, field_type) triple
 * uq_contact_facts_structured already indexes. A correlation, not proof
 * this report caused the save, but the only real signal available: T11 has
 * no separate "the user answered this specific question" event.
 */
async function buildCuriosityAnswerRate(): Promise<CuriosityAnswerRate> {
  const result = await query<{ surfaced: string; answered: string }>(
    `SELECT COUNT(*) AS surfaced,
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM contact_facts cf
                WHERE cf.neo4j_contact_id = csl.phone
                  AND cf.submitted_by_user_id = csl.user_id::text
                  AND cf.field_type = csl.missing_fact
                  AND cf.created_at > csl.surfaced_at
                  AND cf.retracted_at IS NULL
              )
            ) AS answered
     FROM curiosity_surfacing_log csl
     WHERE csl.surfaced_at > NOW() - make_interval(days => ${CURIOSITY_LOOKBACK_DAYS})`,
    [],
    REPORT_QUERY_TIMEOUT_MS,
  );
  const surfaced = Number(result.rows[0]?.surfaced ?? 0);
  const answered = Number(result.rows[0]?.answered ?? 0);
  return { surfaced, answered, answer_rate: roundTo(surfaced > 0 ? answered / surfaced : 0) };
}

export interface LabReport {
  week_start: string;
  ask_dial_table: AskDialRow[];
  technique_conversion: TechniqueConversion;
  spacing_results: SpacingRow[];
  links_funnel: ReferralFunnel;
  budgets_ladder_state: BudgetsLadderState;
  facts_per_week: FactsPerWeekRow[];
  curiosity_answer_rate: CuriosityAnswerRate;
  not_built: string[];
}

const NOT_BUILT = [
  'facts_used_rate: no search path records whether a stored fact changed its result',
];

/**
 * "The report generates itself weekly, no hands" — this IS the generator;
 * labReport.cron.ts calls it once a week and stores the result so every
 * number stays drillable to the raw rows behind it, not just this week's
 * snapshot.
 */
export async function buildLabReport(weekStart: string): Promise<LabReport> {
  const [
    askDialTable,
    techniqueConversion,
    spacingResults,
    linksFunnel,
    budgetsLadderState,
    factsPerWeek,
    curiosityAnswerRate,
  ] = await Promise.all([
    buildAskDialTable(),
    buildTechniqueConversion(),
    buildSpacingResults(),
    getReferralFunnel(),
    buildBudgetsLadderState(),
    buildFactsPerWeek(),
    buildCuriosityAnswerRate(),
  ]);
  return {
    week_start: weekStart,
    ask_dial_table: askDialTable,
    technique_conversion: techniqueConversion,
    spacing_results: spacingResults,
    links_funnel: linksFunnel,
    budgets_ladder_state: budgetsLadderState,
    facts_per_week: factsPerWeek,
    curiosity_answer_rate: curiosityAnswerRate,
    not_built: NOT_BUILT,
  };
}

/** Generates and stores this week's snapshot — idempotent per week_start. */
export async function generateAndStoreWeeklyReport(weekStart: string): Promise<LabReport> {
  const report = await buildLabReport(weekStart);
  await query(
    `INSERT INTO lab_reports (week_start, report_json)
     VALUES ($1::date, $2::jsonb)
     ON CONFLICT (week_start) DO UPDATE SET report_json = $2::jsonb, generated_at = NOW()`,
    [weekStart, JSON.stringify(report)],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return report;
}

export interface StoredLabReport {
  week_start: string;
  report_json: LabReport;
  generated_at: string;
}

export async function getStoredLabReports(limit: number): Promise<StoredLabReport[]> {
  const result = await query<StoredLabReport>(
    `SELECT week_start, report_json, generated_at FROM lab_reports
     ORDER BY week_start DESC LIMIT $1`,
    [limit],
    REPORT_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
