import { randomUUID } from 'crypto';
import { factsByNumber } from '../companyBase/researchFactsByNumber.service';
import { normalizePhone } from '../phone';
import {
  Findings,
  FoundFact,
  PersonReport,
  ResearchStep,
  ResearchSubject,
  SamePerson,
  SourceHit,
  SourceVerdict,
  StopReason,
} from './deepResearch.types';
import { PAGE_PRICE_KEY, readFullPages, runSearches } from './researchCalls';
import {
  ENGINE_CALL,
  PlannedSearch,
  findSearches,
  pagesToRead,
  unseenHits,
  widenSearches,
} from './researchQueries';
import { readPages } from './researchReader';
import { SubjectRefusal, researchSubject } from './researchSubject';
import { SourceRecord, saveRun } from './researchRunRecord';
import { READ_RESERVE_USD, dailyLimitUsd, priceOf, spentOnRun, spentToday } from './researchSpend';

/**
 * One person's deep research, the brief's order: find the right person, read
 * their pages in full, widen from what was found, read again. It stops when
 * two steps in a row add no new fact, or before a step that would pass the
 * person's ceiling or the day's. Every page seen is recorded with its verdict;
 * the facts are written (unless dry_run) on the person's number under the
 * load's tag, private, each with its page.
 */
const DRY_STEPS_TO_STOP = 2;
/** No step starts after this long: the slowest step and its reading still end inside the 5-minute request. */
const LAST_STEP_START_MS = 150_000;
const PHONE_TAIL_CHARS = 4;

export interface ResearchOptions {
  readonly load: string;
  readonly dryRun: boolean;
  readonly maxUsd: number;
}

/** One person's research while it runs. */
interface RunState {
  readonly runId: string;
  readonly subject: ResearchSubject;
  readonly options: ResearchOptions;
  readonly sources: Map<string, SourceRecord>;
  readonly read: Set<string>;
  readonly facts: Map<string, FoundFact>;
  readonly steps: ResearchStep[];
  readonly startedAt: number;
}

function factKey(fact: FoundFact): string {
  return `${fact.key}\u0000${fact.value.trim().toLocaleLowerCase()}`;
}

/** Why the next step may not run, or null when it may. */
async function budgetStop(
  state: RunState,
  priceKeys: readonly string[],
): Promise<StopReason | null> {
  const next = (await priceOf(priceKeys)) + READ_RESERVE_USD;
  if ((await spentOnRun(state.runId)) + next > state.options.maxUsd) return StopReason.PersonBudget;
  if ((await spentToday()) + next > dailyLimitUsd()) return StopReason.DailyBudget;
  return null;
}

/**
 * The model's reading of the pages. When the model cannot be reached the step
 * finds nothing — logged — and the run goes on, so what was already paid for
 * is still recorded.
 */
async function readOrNothing(state: RunState, pages: readonly SourceHit[]): Promise<Findings> {
  try {
    return await readPages(state.subject, pages, state.runId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[deep-research] the pages were not read:', (err as Error).message);
    return { verdicts: [], facts: [] };
  }
}

/** The model's verdicts and facts for one step's pages; returns how many facts are new. */
async function absorb(
  state: RunState,
  step: ResearchStep,
  pages: readonly SourceHit[],
): Promise<number> {
  for (const page of pages) {
    const known = state.sources.get(page.url);
    state.sources.set(page.url, {
      url: page.url,
      provider: page.provider,
      step: known?.step ?? step,
      same_person: known?.same_person ?? null,
    });
  }
  const findings = await readOrNothing(state, pages);
  for (const v of findings.verdicts) {
    const known = state.sources.get(v.url);
    if (known !== undefined) state.sources.set(v.url, { ...known, same_person: v.samePerson });
  }
  let added = 0;
  for (const fact of findings.facts) {
    if (state.facts.has(factKey(fact))) continue;
    state.facts.set(factKey(fact), fact);
    added += 1;
  }
  return added;
}

async function searchStep(
  state: RunState,
  step: ResearchStep,
  searches: readonly PlannedSearch[],
): Promise<number> {
  const hits = await runSearches(state.runId, searches);
  return absorb(state, step, unseenHits(hits, new Set(state.sources.keys())));
}

async function readStep(
  state: RunState,
  step: ResearchStep,
  urls: readonly string[],
): Promise<number> {
  urls.forEach((url) => state.read.add(url));
  return absorb(state, step, await readFullPages(state.runId, urls));
}

function verdicts(state: RunState): SourceVerdict[] {
  return [...state.sources.values()].flatMap((s) =>
    s.same_person === null ? [] : [{ url: s.url, samePerson: s.same_person }],
  );
}

/** What a step will call, decided from what the run holds when the step comes up. */
function stepPlan(
  state: RunState,
  step: ResearchStep,
): { searches: PlannedSearch[]; urls: string[] } {
  if (step === ResearchStep.Find) return { searches: findSearches(state.subject), urls: [] };
  if (step === ResearchStep.Widen) {
    return { searches: widenSearches(state.subject, [...state.facts.values()]), urls: [] };
  }
  return { searches: [], urls: pagesToRead(verdicts(state), state.read) };
}

const STEP_ORDER: readonly ResearchStep[] = [
  ResearchStep.Find,
  ResearchStep.Read,
  ResearchStep.Widen,
  ResearchStep.ReadMore,
];

async function runSteps(state: RunState): Promise<StopReason> {
  let drySteps = 0;
  for (const step of STEP_ORDER) {
    const plan = stepPlan(state, step);
    const priceKeys = [
      ...plan.searches.map((s) => ENGINE_CALL[s.engine].priceKey),
      ...plan.urls.map(() => PAGE_PRICE_KEY),
    ];
    if (Date.now() - state.startedAt > LAST_STEP_START_MS) return StopReason.OutOfTime;
    const stop = await budgetStop(state, priceKeys);
    if (stop !== null) return stop;
    state.steps.push(step);
    const added =
      plan.searches.length > 0
        ? await searchStep(state, step, plan.searches)
        : await readStep(state, step, plan.urls);
    drySteps = added === 0 ? drySteps + 1 : 0;
    if (drySteps >= DRY_STEPS_TO_STOP) return StopReason.NothingNew;
  }
  return StopReason.AllStepsRun;
}

async function writeFacts(state: RunState, facts: readonly FoundFact[]): Promise<number> {
  if (state.options.dryRun || facts.length === 0) return 0;
  const rows = facts.map((f) => ({ ...f, phone: state.subject.phone }));
  return (await factsByNumber(rows, state.options.load, false)).rows_written;
}

function reportOf(
  state: RunState,
  stopped: StopReason,
  written: number,
  costUsd: number,
): PersonReport {
  const sources = [...state.sources.values()];
  const facts = [...state.facts.values()];
  return {
    phone_last4: state.subject.phone.slice(-PHONE_TAIL_CHARS),
    kind: state.subject.kind,
    dry_run: state.options.dryRun,
    load: state.options.load,
    steps_run: state.steps,
    stopped,
    sources_seen: sources.length,
    sources_same_person: sources.filter((s) => s.same_person === SamePerson.Yes).length,
    facts_found: facts.length,
    facts_written: written,
    cost_usd: costUsd,
    facts,
  };
}

async function recordRun(state: RunState, report: PersonReport): Promise<void> {
  await saveRun({
    runId: state.runId,
    phone: state.subject.phone,
    kind: state.subject.kind,
    load: state.options.load,
    dryRun: state.options.dryRun,
    stopped: report.stopped,
    steps: state.steps,
    sources: [...state.sources.values()],
    factsFound: report.facts_found,
    factsWritten: report.facts_written,
    costUsd: report.cost_usd,
  });
}

export async function researchPerson(
  subject: ResearchSubject,
  options: ResearchOptions,
): Promise<PersonReport> {
  const state: RunState = {
    runId: `dr-${randomUUID()}`,
    subject,
    options,
    sources: new Map(),
    read: new Set(),
    facts: new Map(),
    steps: [],
    startedAt: Date.now(),
  };
  const stopped = await runSteps(state);
  const written = await writeFacts(state, [...state.facts.values()]);
  const report = reportOf(state, stopped, written, await spentOnRun(state.runId));
  await recordRun(state, report);
  return report;
}

/** The number's subject, researched — or the reason they may not be. */
export async function researchByNumber(
  rawPhone: string,
  options: ResearchOptions,
): Promise<PersonReport | SubjectRefusal> {
  const subject = await researchSubject(normalizePhone(rawPhone));
  return typeof subject === 'string' ? subject : researchPerson(subject, options);
}
