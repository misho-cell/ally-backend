import { backgroundQuery, query } from '../db/postgres/client';
import { readLabels } from './labelReader.service';
import { TriggerLedger, planResearch } from './researchTriggers.service';
import type { ResearchPlan, ResearchStep } from './researchTriggers.service';
import { webSearch, webSearchConfigured } from './tools/webSearch';

/**
 * Ticket 19 [20]: the research runs itself.
 *
 * The trigger table has decided what to look up for each listed person since
 * Part 3 was written, and nothing ever looked it up — the plan reached an admin
 * screen and stopped. This is the part with hands.
 *
 * WHAT IT WILL NOT DO. It does not write a single claim about a person. It
 * records that a search was run and what a page said, in the page's own words,
 * with the URL. Turning that into „he is the director of X" is a judgement
 * about a real named human being, and a machine making that judgement
 * unattended, into the shared base, is the thing we agreed must never happen.
 * Evidence here; attribution somewhere a person can see it.
 *
 * OFF UNTIL SOMEBODY TURNS IT ON. Every step costs a paid API call, and a job
 * that quietly spends money is a job nobody agreed to. RESEARCH_RUNNER must be
 * set to „on" deliberately; until then this reports why it did nothing and
 * spends nothing. There is also a daily ceiling on searches, counted from what
 * was actually run rather than from an internal tally that a restart resets.
 */

/** Nothing runs until this is „on". Read at call time, so it needs no deploy. */
function runnerOn(): boolean {
  return process.env.RESEARCH_RUNNER === 'on';
}

/**
 * The dials, read at CALL time rather than at import.
 *
 * A spending limit that can only be changed by a deploy is not much of a
 * limit — the moment it matters is the moment somebody wants it lower NOW.
 * This job runs once every few minutes, so reading four environment variables
 * costs nothing and they mean what they say the moment they change.
 */
function dials(): {
  peoplePerTick: number;
  dailyBudget: number;
  refreshDays: number;
  maxSteps: number;
} {
  return {
    peoplePerTick: Number(process.env.RESEARCH_PEOPLE_PER_TICK ?? 10),
    dailyBudget: Number(process.env.RESEARCH_DAILY_SEARCHES ?? 200),
    refreshDays: Number(process.env.RESEARCH_REFRESH_DAYS ?? 30),
    maxSteps: Number(process.env.RESEARCH_MAX_STEPS ?? 3),
  };
}

const QUERY_TIMEOUT_MS = 15_000;

/** The page's own words, bounded at the writer. */
const MAX_SNIPPET_CHARS = 600;
const MAX_NOTE_CHARS = 200;

/** Sources with no integration on this side. Written down, never pretended. */
const NOT_INTEGRATED: ReadonlySet<string> = new Set(['register', 'roster']);

type StepStatus = 'found' | 'nothing' | 'not_attempted' | 'error';

export interface ResearchTickResult {
  readonly ran: boolean;
  /** People whose plan was executed this tick. */
  readonly people: number;
  /** Paid searches actually made. */
  readonly searches: number;
  /** Steps written down as not attempted, by source. */
  readonly not_attempted: number;
  readonly findings: number;
  /** In words, for whoever reads the report — including why nothing happened. */
  readonly verdict: string;
}

interface SearchResult {
  url?: unknown;
  title?: unknown;
  snippet?: unknown;
}

/**
 * Tavily's reply, narrowed. It is typed `object` at the source, so it is
 * checked here rather than asserted — an upstream shape change must show up as
 * „nothing found", never as an exception in a background job.
 */
function resultsOf(reply: object): { results: SearchResult[]; error: string | null } {
  const asRecord = reply as Record<string, unknown>;
  if (typeof asRecord.error === 'string') return { results: [], error: asRecord.error };
  const raw = asRecord.results;
  if (!Array.isArray(raw)) return { results: [], error: null };
  return { results: raw as SearchResult[], error: null };
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, max);
}

/** Paid searches already made today, read from the record rather than counted in memory. */
async function searchesToday(): Promise<number> {
  const result = await backgroundQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM research_steps
     WHERE ran_at >= date_trunc('day', NOW()) AND status <> 'not_attempted'`,
    [],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.n ?? 0);
}

/**
 * Who to research next: people the engine listed, longest un-researched first.
 *
 * Read from the score history rather than by rebuilding the list — the build
 * costs two minutes and this job has no business paying that. The history IS
 * the record of who the engine listed and when.
 */
async function nextPeople(limit: number, refreshDays: number): Promise<{ phone: string }[]> {
  const result = await backgroundQuery<{ phone: string }>(
    `WITH listed AS (
       SELECT DISTINCT ON (h.phone) h.phone, h.built_at, h.rank
       FROM target_score_history h
       ORDER BY h.phone, h.built_at DESC
     )
     SELECT l.phone
     FROM listed l
     LEFT JOIN (
       SELECT phone, MAX(ran_at) AS last_run FROM research_steps GROUP BY phone
     ) r ON r.phone = l.phone
     WHERE r.last_run IS NULL OR r.last_run < NOW() - ($2::int * INTERVAL '1 day')
     ORDER BY r.last_run ASC NULLS FIRST, l.rank ASC
     LIMIT $1::int`,
    [limit, refreshDays],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function recordStep(
  plan: ResearchPlan,
  step: ResearchStep,
  status: StepStatus,
  note: string | null,
): Promise<number> {
  const result = await backgroundQuery<{ id: number }>(
    `INSERT INTO research_steps (phone, trigger, source, query, status, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [plan.phone, plan.trigger, step.source, step.query, status, note],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0].id;
}

async function recordFindings(
  stepId: number,
  phone: string,
  results: SearchResult[],
): Promise<number> {
  const rows = results
    .map((r) => ({
      url: text(r.url, 500),
      title: text(r.title, 300),
      snippet: text(r.snippet, MAX_SNIPPET_CHARS),
    }))
    .filter((r): r is { url: string; title: string | null; snippet: string | null } => {
      return r.url !== null;
    });
  if (rows.length === 0) return 0;
  const written = await backgroundQuery<{ id: number }>(
    `INSERT INTO research_findings (step_id, phone, url, title, snippet)
     SELECT $1::int, $2::text, x.url, x.title, x.snippet
     FROM jsonb_to_recordset($3::jsonb) AS x(url text, title text, snippet text)
     ON CONFLICT (phone, url) DO NOTHING
     RETURNING id`,
    [stepId, phone, JSON.stringify(rows)],
    QUERY_TIMEOUT_MS,
  );
  return written.rows.length;
}

/**
 * LinkedIn has no API here, so the step is a web search narrowed to the site.
 * Written this way rather than silently folded into „web" so the admin report
 * still says which rule asked for what.
 */
function queryFor(step: ResearchStep): string {
  return step.source === 'linkedin' ? `${step.query} site:linkedin.com` : step.query;
}

/**
 * One tick: a few people, their plans, the steps that can actually be run.
 *
 * On the background pool, like the base walk, so a job that spends twelve
 * seconds per search can never hold a connection a person's own search is
 * waiting for.
 */
export async function runResearchOnce(): Promise<ResearchTickResult> {
  const idle = (verdict: string): ResearchTickResult => ({
    ran: false,
    people: 0,
    searches: 0,
    not_attempted: 0,
    findings: 0,
    verdict,
  });

  // A tick must never overlap itself.
  //
  // One tick is ten people times three steps times twelve seconds of search —
  // about six minutes against a fifteen-minute timer, which looks safe until
  // somebody raises RESEARCH_PEOPLE_PER_TICK or RESEARCH_MAX_STEPS. I made
  // those readable at call time on purpose, so a tick CAN now be told to run
  // longer than the gap between ticks, and setInterval would then start a
  // second one on top of the first. Two ticks reading the same budget before
  // either has written to it spend it twice — the ceiling would hold on paper
  // and not in the bank.
  if (running) {
    return idle('The previous research tick is still running; this one was skipped.');
  }
  running = true;
  try {
    return await tick(idle);
  } finally {
    running = false;
  }
}

/** True while a tick is in flight. Per process, which is where the timer is. */
let running = false;

async function tick(idle: (verdict: string) => ResearchTickResult): Promise<ResearchTickResult> {
  if (!runnerOn()) {
    return idle(
      'Automatic research is off (set RESEARCH_RUNNER=on to start it). Every step is a ' +
        'paid search, so it does not begin on its own.',
    );
  }

  if (!webSearchConfigured()) {
    // Asked once, up front. Left to discover it call by call, the runner would
    // spend its whole daily allowance writing the same error row 200 times and
    // then report a day's work.
    return idle('Web search is not configured (TAVILY_API_KEY missing); no step can run.');
  }

  const { peoplePerTick, dailyBudget, refreshDays, maxSteps } = dials();
  const spent = await searchesToday();
  const remaining = dailyBudget - spent;
  if (remaining <= 0) {
    return idle(
      `Today's search budget is spent (${spent}/${dailyBudget}). ` +
        'Raise RESEARCH_DAILY_SEARCHES to allow more.',
    );
  }

  const people = await nextPeople(peoplePerTick, refreshDays);
  if (people.length === 0) {
    return idle('Nobody is due: every listed person has been researched recently.');
  }

  const phones = people.map((p) => p.phone);
  const signals = await readLabels(phones);
  const ledger = new TriggerLedger();

  let searches = 0;
  let notAttempted = 0;
  let findings = 0;
  let budget = remaining;

  for (const phone of phones) {
    const forPhone = signals.get(phone);
    if (forPhone === undefined) continue;
    // The NAME, not the label: the label carries the company word glued on, and
    // the first live run searched the register for „Levan Shalamberidze Axel
    // Member".
    const name = forPhone.name_tokens.slice(0, 2).join(' ');
    const plan = ledger.record(planResearch(phone, name, forPhone));

    for (const step of plan.steps.slice(0, maxSteps)) {
      if (NOT_INTEGRATED.has(step.source)) {
        await recordStep(plan, step, 'not_attempted', `no ${step.source} integration on this side`);
        notAttempted += 1;
        continue;
      }
      if (budget <= 0) break;
      budget -= 1;
      searches += 1;

      let reply: object;
      try {
        reply = await webSearch(queryFor(step));
      } catch (err) {
        await recordStep(plan, step, 'error', text((err as Error).message, MAX_NOTE_CHARS));
        continue;
      }
      const { results, error } = resultsOf(reply);
      if (error !== null) {
        await recordStep(plan, step, 'error', error.slice(0, MAX_NOTE_CHARS));
        continue;
      }
      if (results.length === 0) {
        await recordStep(plan, step, 'nothing', null);
        continue;
      }
      const stepId = await recordStep(plan, step, 'found', null);
      findings += await recordFindings(stepId, phone, results);
    }
    if (budget <= 0) break;
  }

  return {
    ran: true,
    people: phones.length,
    searches,
    not_attempted: notAttempted,
    findings,
    verdict:
      `${phones.length} people, ${searches} searches, ${findings} new findings. ` +
      (notAttempted > 0
        ? `${notAttempted} steps were NOT run (register and roster have no integration here) ` +
          'and are recorded as not attempted, not as nothing found.'
        : 'Every planned step was run.'),
  };
}

export interface ResearchTrailStep {
  readonly source: string;
  readonly query: string;
  readonly status: StepStatus;
  readonly note: string | null;
  readonly ran_at: string;
  readonly findings: { url: string; title: string | null; snippet: string | null }[];
}

/** How many of one person's steps a single read returns. */
const TRAIL_LIMIT = 50;

/**
 * One person's whole research trail, the steps that were not run included.
 *
 * On the main pool: this is somebody looking at a screen and waiting, not a
 * night job. Bounded, like every read here.
 */
export async function researchTrail(phone: string): Promise<ResearchTrailStep[]> {
  const result = await query<{
    source: string;
    query: string;
    status: StepStatus;
    note: string | null;
    ran_at: string;
    findings: { url: string; title: string | null; snippet: string | null }[] | null;
  }>(
    `SELECT s.source, s.query, s.status, s.note, s.ran_at::text AS ran_at,
            COALESCE(
              (SELECT jsonb_agg(jsonb_build_object('url', f.url, 'title', f.title,
                                                   'snippet', f.snippet)
                                ORDER BY f.found_at)
               FROM research_findings f WHERE f.step_id = s.id),
              '[]'::jsonb
            ) AS findings
     FROM research_steps s
     WHERE s.phone = $1
     ORDER BY s.ran_at DESC
     LIMIT $2::int`,
    [phone, TRAIL_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({ ...row, findings: row.findings ?? [] }));
}

export interface ResearchStatus {
  readonly on: boolean;
  readonly searches_today: number;
  readonly daily_budget: number;
  readonly people_researched: number;
  readonly findings: number;
  readonly last_run: string | null;
}

/** What the runner has done, for the admin read and the morning report. */
export async function researchStatus(): Promise<ResearchStatus> {
  const result = await backgroundQuery<{
    searches_today: string;
    people: string;
    findings: string;
    last_run: string | null;
  }>(
    `SELECT (SELECT COUNT(*)::text FROM research_steps
              WHERE ran_at >= date_trunc('day', NOW()) AND status <> 'not_attempted')
                                                                     AS searches_today,
            (SELECT COUNT(DISTINCT phone)::text FROM research_steps) AS people,
            (SELECT COUNT(*)::text FROM research_findings)           AS findings,
            (SELECT MAX(ran_at)::text FROM research_steps)           AS last_run`,
    [],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    on: runnerOn(),
    searches_today: Number(row?.searches_today ?? 0),
    daily_budget: dials().dailyBudget,
    people_researched: Number(row?.people ?? 0),
    findings: Number(row?.findings ?? 0),
    last_run: row?.last_run ?? null,
  };
}
