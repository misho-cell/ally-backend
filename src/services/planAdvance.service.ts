import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
import { NamedAction, PlanWithSteps, planHasSteps, stepById, stepsOf } from './planSteps';
import { georgianScriptName } from './georgianScriptName';
import { ownerNamedAGoBetween } from './severalRoutes';
import { phoneDigits } from './phone';
import {
  asksAlongside,
  StepEnd,
  isForward,
  stepAfter,
  StepRoom,
  stepAnsweredNote,
  stepForRecipient,
  stepRoom,
  stepStartedEvent,
} from './planAdvance';
import {
  StepEventKind,
  moveToStep,
  planPosition,
  recordStepEvent,
  recordStepEventOnce,
  stepOfAsk,
} from './planProgress.service';

/**
 * Autonomy stage 2, K3: the server moves the plan on what really happened — a
 * message sent, an answer, a no, a name, silence — by the step's own rule, and
 * wakes the goal with a short event naming the next step. No owner question in
 * between: the owner approved these rules with the plan.
 *
 * Progress must never cost a send or an answer, so every hook here catches,
 * logs and carries on; a lost event leaves „where we are" one step behind,
 * which the next send corrects.
 */

const ADVANCE_QUERY_TIMEOUT_MS = 5_000;
/** A member has a few numbers at most; the step is matched on any of them. */
const MAX_PHONES_PER_MEMBER = 5;
/** Goals the silence sweep looks at per tick. */
export const MAX_SILENT_STEPS_PER_SWEEP = 50;
const MS_PER_DAY = 86_400_000;

export type StepEventText = Readonly<Record<RunLanguage, string>>;

interface PlanState {
  readonly plan: PlanWithSteps & {
    readonly people_to_involve?: readonly { readonly phone: string }[];
  };
  readonly current: string | null;
}

function logFailure(where: string, taskId: number, err: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[plan-steps] task ${taskId}: ${where} not recorded:`, (err as Error).message);
}

/** The approved plan of an open goal and its current step; null when there is none. */
async function approvedPlanState(taskId: number): Promise<PlanState | null> {
  const result = await query<{ plan: PlanWithSteps | null; plan_step: string | null }>(
    `SELECT plan, plan_step FROM tasks
      WHERE id = $1 AND status = 'open' AND plan IS NOT NULL AND plan_approved_at IS NOT NULL
      LIMIT 1`,
    [taskId],
    ADVANCE_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row?.plan ? { plan: row.plan, current: row.plan_step } : null;
}

async function phonesOfMember(userId: number): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = $1 AND phone IS NOT NULL LIMIT $2`,
    [userId, MAX_PHONES_PER_MEMBER],
    ADVANCE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.phone);
}

/** The step a message to this member belongs to, moving the plan forward to it. */
async function stepForMember(
  taskId: number,
  state: PlanState,
  userId: number,
): Promise<string | null> {
  const step = stepForRecipient(state.plan, state.current, await phonesOfMember(userId));
  if (step === null) return null;
  if (isForward(state.plan, state.current, step.id) && step.id !== state.current) {
    await moveToStep(taskId, step.id);
  }
  return step.id;
}

/** An ask went out on this goal: `sent` on its step (ref = the ask id). */
export async function notePlanAskSent(
  taskId: number,
  askId: number,
  toUserId: number,
): Promise<void> {
  try {
    const state = await approvedPlanState(taskId);
    if (state === null) return;
    const stepId = await stepForMember(taskId, state, toUserId);
    if (stepId !== null) await recordStepEvent(taskId, stepId, StepEventKind.Sent, String(askId));
  } catch (err) {
    logFailure('sent', taskId, err);
  }
}

/** An introduction was asked through a go-between: `named` on the go-between's step. */
export async function notePlanNamed(
  taskId: number,
  requestId: number,
  mediatorUserId: number,
): Promise<void> {
  try {
    const state = await approvedPlanState(taskId);
    if (state === null) return;
    const stepId = await stepForMember(taskId, state, mediatorUserId);
    if (stepId !== null)
      await recordStepEvent(taskId, stepId, StepEventKind.Named, String(requestId));
  } catch (err) {
    logFailure('named', taskId, err);
  }
}

export interface ArrivedAnswer {
  readonly id: number;
  readonly declined: boolean;
}

interface AnswerOutcome {
  readonly stepId: string;
  readonly declined: boolean;
}

async function recordAnswers(
  taskId: number,
  answers: readonly ArrivedAnswer[],
): Promise<AnswerOutcome[]> {
  const outcomes: AnswerOutcome[] = [];
  for (const answer of answers) {
    const stepId = await stepOfAsk(taskId, answer.id);
    if (stepId === null) continue;
    const kind = answer.declined ? StepEventKind.Declined : StepEventKind.Answered;
    await recordStepEventOnce(taskId, stepId, kind, String(answer.id));
    outcomes.push({ stepId, declined: answer.declined });
  }
  return outcomes;
}

/**
 * Tester's report 8 Nov, C6: Gela said no on the plan's only step and the goal
 * went silent — no next step, no note, and the run's „I'll look for someone
 * else" was dropped by the quiet-after-a-no rule. A no that leaves the approved
 * plan with nowhere to go says so, and the run proposes the next way.
 */
export const PLAN_RAN_OUT_EVENT: StepEventText = {
  ka:
    'გეგმის ბოლო ნაბიჯზე უარი მოვიდა — დამტკიცებული გეგმა ამოიწურა. მფლობელს ერთი ხაზით ' +
    'უთხარი და იმავე პასუხში propose_task_plan-ით შესთავაზე შემდეგი გზა: სხვა ადამიანი მის ' +
    'ქსელში, მეორე წრე ან ვები. არ გაჩერდე.',
  en:
    "A no came on the plan's last step — the approved plan has run out. Tell the owner in one " +
    'line and, in the same reply, propose the next way with propose_task_plan: another person ' +
    'in his network, the second circle or the web. Do not stop.',
  ru:
    'На последнем шаге плана пришёл отказ — утверждённый план исчерпан. Скажи владельцу одной ' +
    'строкой и в том же ответе предложи следующий путь через propose_task_plan: другой человек ' +
    'из его сети, второй круг или веб. Не останавливайся.',
  es:
    'Llegó un no en el último paso del plan: el plan aprobado se agotó. Díselo al dueño en una ' +
    'línea y, en la misma respuesta, propón el siguiente camino con propose_task_plan: otra ' +
    'persona de su red, el segundo círculo o la web. No te detengas.',
};

/** A no on the current step moves the plan by its on_no rule; a no already acted on is named again. */
async function afterDecline(
  taskId: number,
  state: PlanState,
  outcomes: readonly AnswerOutcome[],
): Promise<StepEventText | null> {
  const declined = outcomes.filter((o) => o.declined);
  const onCurrent = declined.find((o) => o.stepId === state.current);
  if (onCurrent !== undefined) {
    const next = stepAfter(state.plan, onCurrent.stepId, StepEnd.Declined);
    if (next === null) return PLAN_RAN_OUT_EVENT;
    if (!isForward(state.plan, state.current, next.id)) return null;
    await moveToStep(taskId, next.id);
    return stepStartedEvent(state.plan, next, { stepId: onCurrent.stepId, end: StepEnd.Declined });
  }
  const current = stepById(state.plan, state.current);
  const earlier = declined.find(
    (o) => current !== null && isForward(state.plan, o.stepId, current.id),
  );
  if (current === null || earlier === undefined) return null;
  return stepStartedEvent(state.plan, current, { stepId: earlier.stepId, end: StepEnd.Declined });
}

/**
 * Answers arrived for this goal: each is recorded on the step its ask was sent
 * for, and the line returned goes under the answer wake's event — the step's
 * rule for a yes / a name, or the next step after a no. Null for a plan
 * without steps, whose wake reads exactly as before.
 */
export async function planStepNoteForAnswers(
  taskId: number,
  answers: readonly ArrivedAnswer[],
): Promise<StepEventText | null> {
  try {
    const state = await approvedPlanState(taskId);
    if (state === null) return null;
    const outcomes = await recordAnswers(taskId, answers);
    if (!planHasSteps(state.plan) || outcomes.length === 0) return null;
    const answered = outcomes.find((o) => !o.declined);
    if (answered !== undefined) return stepAnsweredNote(state.plan, answered.stepId);
    return await afterDecline(taskId, state, outcomes);
  } catch (err) {
    logFailure('answer', taskId, err);
    return null;
  }
}

interface SilenceRow {
  readonly id: number;
  readonly plan: PlanWithSteps;
  readonly plan_step: string;
  readonly last_sent: string | null;
  readonly heard: boolean;
}

/** True when the current step's silence rule is due: sent, nothing heard, the days gone. */
export function silenceIsDue(row: SilenceRow, now: Date): boolean {
  const step = stepById(row.plan, row.plan_step);
  if (step?.on_silence === undefined || row.last_sent === null || row.heard) return false;
  const waited = now.getTime() - new Date(row.last_sent).getTime();
  return waited >= step.on_silence.after_days * MS_PER_DAY;
}

async function goalsWaitingOnAStep(): Promise<SilenceRow[]> {
  const result = await query<SilenceRow>(
    `SELECT t.id, t.plan, t.plan_step,
            (SELECT MAX(e.created_at) FROM plan_step_events e
              WHERE e.task_id = t.id AND e.step_id = t.plan_step AND e.kind = $1) AS last_sent,
            EXISTS (SELECT 1 FROM plan_step_events e
              WHERE e.task_id = t.id AND e.step_id = t.plan_step AND e.kind = ANY($2::text[])) AS heard
       FROM tasks t
      WHERE t.status = 'open' AND t.plan_approved_at IS NOT NULL AND t.plan_step IS NOT NULL
        AND jsonb_typeof(t.plan->'steps') = 'array'
      ORDER BY t.id
      LIMIT $3`,
    [
      StepEventKind.Sent,
      [StepEventKind.Answered, StepEventKind.Declined, StepEventKind.Silent],
      MAX_SILENT_STEPS_PER_SWEEP,
    ],
    ADVANCE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Wakes a goal with a step event; the engine passes its own wake in. */
export type StepWaker = (taskId: number, event: StepEventText) => void;

async function advanceOnSilence(row: SilenceRow, wake: StepWaker): Promise<boolean> {
  if (!(await recordStepEventOnce(row.id, row.plan_step, StepEventKind.Silent))) return false;
  const next = stepAfter(row.plan, row.plan_step, StepEnd.Silent);
  if (next === null || !isForward(row.plan, row.plan_step, next.id)) return false;
  await moveToStep(row.id, next.id);
  wake(row.id, stepStartedEvent(row.plan, next, { stepId: row.plan_step, end: StepEnd.Silent }));
  return true;
}

/** The engine's tick: every step whose silence ran out moves on by its rule. */
export async function sweepSilentSteps(wake: StepWaker, now: Date = new Date()): Promise<number> {
  let moved = 0;
  for (const row of await goalsWaitingOnAStep()) {
    if (!silenceIsDue(row, now)) continue;
    try {
      if (await advanceOnSilence(row, wake)) moved++;
    } catch (err) {
      logFailure('silence', row.id, err);
    }
  }
  return moved;
}

/** Has the current step been heard from — an answer, a no, or its silence? */
async function currentStepHeard(taskId: number, stepId: string | null): Promise<boolean> {
  if (stepId === null) return false;
  const result = await query<{ one: number }>(
    `SELECT 1 AS one FROM plan_step_events
      WHERE task_id = $1 AND step_id = $2 AND kind = ANY($3::text[])
      LIMIT 1`,
    [taskId, stepId, [StepEventKind.Answered, StepEventKind.Declined, StepEventKind.Silent]],
    ADVANCE_QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/**
 * K10: may this person be asked now, by the plan's steps? Fails OPEN to the
 * plan wall that already admitted them: a progress read that fails must not
 * stop an approved plan's ask (the person is in the plan the owner approved).
 */
export async function planStepRoom(
  taskId: number,
  plan: PlanWithSteps,
  phone: string,
): Promise<StepRoom> {
  try {
    const { currentStepId } = await planPosition(taskId);
    return stepRoom(plan, currentStepId, await currentStepHeard(taskId, currentStepId), phone);
  } catch (err) {
    logFailure('step room', taskId, err);
    return { allowed: true };
  }
}

/**
 * K12: day one of a plan with steps is step one. The plan is moved to its first
 * step (once — a retried wake finds it there) and the event names it. Null for
 * a plan without steps, whose day one reads as before.
 */
export async function planDayOneEvent(taskId: number): Promise<StepEventText | null> {
  try {
    const state = await approvedPlanState(taskId);
    if (state === null || !planHasSteps(state.plan)) return null;
    const first = stepsOf(state.plan)[0];
    if (state.current === null) await moveToStep(taskId, first.id);
    const current = stepById(state.plan, state.current) ?? first;
    const at = stepsOf(state.plan).findIndex((s) => s.id === current.id);
    return stepStartedEvent(state.plan, current, undefined, asksAlongside(state.plan, at));
  } catch (err) {
    logFailure('day one', taskId, err);
    return null;
  }
}

/**
 * K9 audit B6: does this goal's approved plan name this member (any of their
 * numbers)? False on no plan, and on a failed read — the event then keeps the
 * no-plan wording, which waits for the owner.
 */
export async function approvedPlanNamesMember(taskId: number, userId: number): Promise<boolean> {
  try {
    const state = await approvedPlanState(taskId);
    if (state === null) return false;
    const inPlan = new Set((state.plan.people_to_involve ?? []).map((p) => phoneDigits(p.phone)));
    return (await phonesOfMember(userId)).some((phone) => inPlan.has(phoneDigits(phone)));
  } catch (err) {
    logFailure('plan member', taskId, err);
    return false;
  }
}

const MAX_ANSWERS_READ_FOR_NAMES = 20;

/** A name, in the spellings it is saved and read in, appears in one of these answers. */
function nameIsIn(answers: readonly string[], name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === '') return false;
  const spellings = [trimmed, georgianScriptName(trimmed)];
  return answers.some((answer) => ownerNamedAGoBetween(answer, spellings));
}

/**
 * K9 audit B4 (structural, stage 2): a step with `on_named: ask` sends the run to
 * ask the person an answer named, and the plan wall refused them as outside the
 * plan. The owner approved that rule with the plan, so a person is admitted
 * when an answer recorded on such a step names them — names are matched, as in
 * introYesGate; no words are read for meaning. False on any failure: the wall
 * stays shut, the direction that costs a question, never a message.
 */
export async function namedOnAnAskStep(taskId: number, personName: string): Promise<boolean> {
  try {
    const state = await approvedPlanState(taskId);
    if (state === null || !planHasSteps(state.plan)) return false;
    const result = await query<{ step_id: string; answer: string | null }>(
      `SELECT e.step_id, a.answer
         FROM plan_step_events e
         JOIN task_asks a ON a.id::text = e.ref AND a.task_id = e.task_id
        WHERE e.task_id = $1 AND e.kind = $2
        ORDER BY e.id DESC
        LIMIT $3`,
      [taskId, StepEventKind.Answered, MAX_ANSWERS_READ_FOR_NAMES],
      ADVANCE_QUERY_TIMEOUT_MS,
    );
    const answers = result.rows
      .filter((row) => stepById(state.plan, row.step_id)?.on_named?.action === NamedAction.Ask)
      .map((row) => row.answer ?? '');
    return nameIsIn(answers, personName);
  } catch (err) {
    logFailure('named on an ask step', taskId, err);
    return false;
  }
}
