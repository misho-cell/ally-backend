import { phoneDigits } from './phone';

/**
 * Autonomy stage 2, K1 (Misho, 5 Nov): the plan as an executable list of steps.
 *
 * On the owner's real three-day goal the plan was only „what counts as solved,
 * which routes, whom to write" — no order, no rule for silence, a „no" or a name
 * given, and no marked point where the owner's word is needed. So every step
 * became a fresh question to the owner. A step carries those rules itself.
 *
 * Founder rule #8779: the server checks STRUCTURE here — ids, references, that a
 * step's person is one the plan names. It never reads what anybody meant.
 */

export enum StepAction {
  Ask = 'ask',
  Introduce = 'introduce',
  Search = 'search',
  Web = 'web',
}

/** What a step does with a person an answer names. */
export enum NamedAction {
  Introduce = 'introduce',
  Ask = 'ask',
}

export interface StepWho {
  readonly phone?: string;
  readonly name?: string;
}

export interface PlanStep {
  readonly id: string;
  readonly action: StepAction;
  /** ask / introduce: the person asked (for introduce, the go-between). */
  readonly who?: StepWho;
  /** What this step asks or looks for, in a few words. */
  readonly what?: string;
  readonly on_silence?: { readonly after_days: number; readonly next_step: string };
  readonly on_no?: { readonly next_step: string };
  readonly on_named?: { readonly action: NamedAction };
  /** A point the plan marked in advance: the owner's word is needed here. */
  readonly ask_owner: boolean;
}

export const MAX_STEPS = 10;
export const MAX_STEP_TEXT_CHARS = 160;
export const MIN_SILENCE_DAYS = 1;
export const MAX_SILENCE_DAYS = 14;
const STEP_ID_PREFIX = 's';
/** The id the one step of an old plan carries. */
export const LEGACY_STEP_ID = `${STEP_ID_PREFIX}1`;

const STEP_ACTIONS: readonly string[] = Object.values(StepAction);
const NAMED_ACTIONS: readonly string[] = Object.values(NamedAction);
const ACTIONS_WITH_A_PERSON: ReadonlySet<StepAction> = new Set([
  StepAction.Ask,
  StepAction.Introduce,
]);

export type StepsOutcome = { ok: true; value: PlanStep[] } | { ok: false; error: string };

/** The part of a plan the steps are checked against. */
export interface StepsContext {
  readonly peoplePhones: readonly string[];
}

/** The plan fields this module reads; TaskPlan satisfies it. */
export interface PlanWithSteps {
  readonly steps?: readonly PlanStep[];
}

type Raw = Record<string, unknown>;

function asObject(raw: unknown): Raw | null {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Raw) : null;
}

function shortText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  return text === '' ? undefined : text.slice(0, MAX_STEP_TEXT_CHARS);
}

function stepIdOf(raw: Raw, index: number): string {
  return shortText(raw.id) ?? `${STEP_ID_PREFIX}${index + 1}`;
}

function readWho(raw: unknown): StepWho | undefined {
  const who = asObject(raw);
  if (who === null) return undefined;
  const phone = shortText(who.phone);
  const name = shortText(who.name);
  if (phone === undefined && name === undefined) return undefined;
  return { ...(phone !== undefined && { phone }), ...(name !== undefined && { name }) };
}

function readNextStep(raw: unknown): string | undefined {
  return shortText(asObject(raw)?.next_step);
}

/** One step as written, before the references between steps are checked. */
interface DraftStep {
  readonly step: PlanStep;
  readonly silenceDays: unknown;
}

function readStep(
  raw: unknown,
  index: number,
): { ok: true; value: DraftStep } | { ok: false; error: string } {
  const item = asObject(raw);
  if (item === null) return { ok: false, error: `step ${index + 1} must be an object` };
  const id = stepIdOf(item, index);
  const action = typeof item.action === 'string' ? item.action.trim() : '';
  if (!STEP_ACTIONS.includes(action)) {
    return { ok: false, error: `step ${id}: action must be one of ${STEP_ACTIONS.join(', ')}` };
  }
  const silence = asObject(item.on_silence);
  const silenceNext = readNextStep(item.on_silence);
  const noNext = readNextStep(item.on_no);
  const named = asObject(item.on_named)?.action;
  if (named !== undefined && !(typeof named === 'string' && NAMED_ACTIONS.includes(named))) {
    return {
      ok: false,
      error: `step ${id}: on_named.action must be one of ${NAMED_ACTIONS.join(', ')}`,
    };
  }
  const who = readWho(item.who);
  const what = shortText(item.what);
  const step: PlanStep = {
    id,
    action: action as StepAction,
    ...(who !== undefined && { who }),
    ...(what !== undefined && { what }),
    ...(silenceNext !== undefined && { on_silence: { after_days: 0, next_step: silenceNext } }),
    ...(noNext !== undefined && { on_no: { next_step: noNext } }),
    ...(typeof named === 'string' && { on_named: { action: named as NamedAction } }),
    ask_owner: item.ask_owner === true,
  };
  return { ok: true, value: { step, silenceDays: silence?.after_days } };
}

function silenceDaysError(id: string, days: unknown): string | null {
  const ok =
    typeof days === 'number' &&
    Number.isInteger(days) &&
    days >= MIN_SILENCE_DAYS &&
    days <= MAX_SILENCE_DAYS;
  return ok
    ? null
    : `step ${id}: on_silence.after_days must be a whole number from ${MIN_SILENCE_DAYS} to ${MAX_SILENCE_DAYS}`;
}

/** A next_step names a LATER step of this plan: steps only move forward, so a plan always ends. */
function pointsForward(id: string, next: string, order: ReadonlyMap<string, number>): boolean {
  const to = order.get(next);
  return to !== undefined && to > (order.get(id) ?? 0);
}

/**
 * Ops' daily checks (6, 7 and 8 Nov) and Tornike's 8 Nov report, #12: the model
 * put on_no / on_silence on the plan's last step, or pointed one at a step it
 * never wrote, and the whole plan was refused for it. Such a rule leads nowhere,
 * so it is dropped and the plan goes on; the steps still only move forward.
 */
function withoutDeadEnds(draft: DraftStep, order: ReadonlyMap<string, number>): DraftStep {
  const { step } = draft;
  const keepSilence =
    step.on_silence !== undefined && pointsForward(step.id, step.on_silence.next_step, order);
  const keepNo = step.on_no !== undefined && pointsForward(step.id, step.on_no.next_step, order);
  if (keepSilence === (step.on_silence !== undefined) && keepNo === (step.on_no !== undefined)) {
    return draft;
  }
  const { on_silence: silence, on_no: no, ...rest } = step;
  return {
    ...draft,
    step: {
      ...rest,
      ...(keepSilence && silence !== undefined && { on_silence: silence }),
      ...(keepNo && no !== undefined && { on_no: no }),
    },
  };
}

function personError(step: PlanStep, peopleDigits: ReadonlySet<string>): string | null {
  if (!ACTIONS_WITH_A_PERSON.has(step.action)) return null;
  const digits = phoneDigits(step.who?.phone ?? '');
  if (digits === '') {
    return `step ${step.id}: an ${step.action} step needs who.phone (the phone id from a search result)`;
  }
  return peopleDigits.has(digits)
    ? null
    : `step ${step.id}: ${step.who?.name ?? 'this person'} is not in people_to_involve — add them there too, with the same phone`;
}

function stepError(draft: DraftStep, people: ReadonlySet<string>): string | null {
  const { step } = draft;
  if (step.on_silence !== undefined) {
    const days = silenceDaysError(step.id, draft.silenceDays);
    if (days !== null) return days;
  }
  return personError(step, people);
}

function withSilenceDays(draft: DraftStep): PlanStep {
  if (draft.step.on_silence === undefined) return draft.step;
  return {
    ...draft.step,
    on_silence: {
      after_days: draft.silenceDays as number,
      next_step: draft.step.on_silence.next_step,
    },
  };
}

function readDrafts(
  rawSteps: readonly unknown[],
): { ok: true; value: DraftStep[] } | { ok: false; error: string } {
  const drafts: DraftStep[] = [];
  for (const [index, raw] of rawSteps.entries()) {
    const read = readStep(raw, index);
    if (!read.ok) return read;
    if (drafts.some((d) => d.step.id === read.value.step.id)) {
      return { ok: false, error: `step id "${read.value.step.id}" is used twice` };
    }
    drafts.push(read.value);
  }
  return { ok: true, value: drafts };
}

/**
 * Read the plan's steps. Absent or empty → no steps (an old-shape plan), which is
 * not an error: `stepsOf` reads such a plan as one step.
 */
export function parseSteps(raw: unknown, context: StepsContext): StepsOutcome {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'steps must be a list' };
  if (raw.length > MAX_STEPS) return { ok: false, error: `at most ${MAX_STEPS} steps` };
  const drafts = readDrafts(raw);
  if (!drafts.ok) return drafts;
  const order = new Map(drafts.value.map((d, index) => [d.step.id, index]));
  const people = new Set(context.peoplePhones.map(phoneDigits).filter((d) => d !== ''));
  const kept = drafts.value.map((draft) => withoutDeadEnds(draft, order));
  for (const draft of kept) {
    const error = stepError(draft, people);
    if (error !== null) return { ok: false, error };
  }
  return { ok: true, value: kept.map(withSilenceDays) };
}

/** True only for a plan the model wrote steps for. */
export function planHasSteps(plan: PlanWithSteps | null | undefined): boolean {
  return (plan?.steps?.length ?? 0) > 0;
}

/** The one step an old plan is read as: ask everyone the plan names. */
export const LEGACY_STEP: PlanStep = {
  id: LEGACY_STEP_ID,
  action: StepAction.Ask,
  ask_owner: false,
};

/** The plan's steps; a plan without steps is one step „ask everyone in people_to_involve". */
export function stepsOf(plan: PlanWithSteps): readonly PlanStep[] {
  return planHasSteps(plan) ? (plan.steps as readonly PlanStep[]) : [LEGACY_STEP];
}

export function stepById(plan: PlanWithSteps, id: string | null): PlanStep | null {
  if (id === null) return null;
  return stepsOf(plan).find((s) => s.id === id) ?? null;
}

/** 1-based position of a step, as the owner and the model read it. */
export function stepNumber(plan: PlanWithSteps, id: string): number {
  return stepsOf(plan).findIndex((s) => s.id === id) + 1;
}

/** The step after this one in the written order, or null at the end. */
export function nextInOrder(plan: PlanWithSteps, id: string): PlanStep | null {
  const steps = stepsOf(plan);
  const at = steps.findIndex((s) => s.id === id);
  return at < 0 ? null : (steps[at + 1] ?? null);
}

/** Does this step ask this phone? An ask step with no `who` asks everyone in the plan. */
export function stepAsksPhone(step: PlanStep, phone: string): boolean {
  const digits = phoneDigits(phone);
  if (digits === '' || step.who?.phone === undefined) return false;
  return phoneDigits(step.who.phone) === digits;
}

/** The steps the approval covers without asking the owner again. */
export function stepsWithoutOwner(plan: PlanWithSteps): readonly PlanStep[] {
  return stepsOf(plan).filter((s) => !s.ask_owner);
}
