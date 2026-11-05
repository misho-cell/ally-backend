import { PlanStep, PlanWithSteps, nextInOrder, stepById, stepNumber, stepsOf } from './planSteps';
import { StepEvent, StepEventKind } from './planProgress.service';

/**
 * Autonomy stage 2, K4: „where we are", at the top of every goal run.
 *
 * Every run of a goal used to start with no memory of which step of the plan
 * was under way, and the cheapest way out of not knowing was to ask the owner.
 * This block is the server's own record — the result, the current step, the
 * last thing that happened, the next step, and what may be done without asking.
 *
 * Model-facing and Georgian, like the engine section it sits above. Dates are
 * absolute, so the same record always reads the same.
 */

export interface WhereWeAreInput {
  readonly plan: PlanWithSteps & { readonly solved_when: string; readonly result_when?: string };
  readonly currentStepId: string | null;
  /** Newest first. */
  readonly events: readonly StepEvent[];
  /** K5: the owner said „do what's needed / you decide" when approving. */
  readonly delegated?: boolean;
}

const ACTION_WORDS: Readonly<Record<PlanStep['action'], string>> = {
  ask: 'კითხვა',
  introduce: 'გაცნობის თხოვნა',
  search: 'ქსელში ძებნა',
  web: 'ვებ-ძიება',
};

const EVENT_WORDS: Readonly<Record<StepEventKind, string>> = {
  [StepEventKind.Started]: 'დაიწყო',
  [StepEventKind.Sent]: 'კითხვა გაიგზავნა',
  [StepEventKind.Answered]: 'პასუხი მოვიდა',
  [StepEventKind.Declined]: 'უარი',
  [StepEventKind.Silent]: 'პასუხი ვადაში არ მოვიდა',
  [StepEventKind.Named]: 'ვინმე დაასახელა — გაცნობა ითხოვა',
};

const EVERYONE_IN_THE_PLAN = 'გეგმის ყველა ადამიანი';
const MINUTES_OF_ISO = 16;

function stepLine(plan: PlanWithSteps, step: PlanStep): string {
  const who =
    step.who?.name ?? (step.who === undefined && step.action === 'ask' ? EVERYONE_IN_THE_PLAN : '');
  const what = step.what === undefined ? '' : ` (${step.what})`;
  return `${stepNumber(plan, step.id)} — ${ACTION_WORDS[step.action]}${who === '' ? '' : ` — ${who}`}${what}`;
}

function when(at: string | Date): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? ''
    : ` (${date.toISOString().slice(0, MINUTES_OF_ISO).replace('T', ' ')} UTC)`;
}

function lastEventLine(plan: PlanWithSteps, events: readonly StepEvent[]): string {
  const last = events[0];
  if (last === undefined) return 'ბოლო მოვლენა: ჯერ არაფერი.';
  const n = stepNumber(plan, last.step_id);
  const where = n > 0 ? `ნაბიჯი ${n}` : 'გეგმის გარეთ';
  return `ბოლო მოვლენა: ${where} — ${EVENT_WORDS[last.kind]}${when(last.created_at)}.`;
}

function currentAndNext(plan: PlanWithSteps, currentId: string | null): string[] {
  const current = stepById(plan, currentId);
  if (current === null) {
    const first = stepsOf(plan)[0];
    return [`ახლანდელი ნაბიჯი: ჯერ არცერთი არ დაწყებულა. პირველი: ${stepLine(plan, first)}.`];
  }
  const next = nextInOrder(plan, current.id);
  return [
    `ახლანდელი ნაბიჯი: ${stepLine(plan, current)}.`,
    next === null
      ? 'შემდეგი ნაბიჯი: ეს გეგმის ბოლო ნაბიჯია.'
      : `შემდეგი ნაბიჯი (თანმიმდევრობით; უარზე/სიჩუმეზე — ნაბიჯის წესით): ${stepLine(plan, next)}.`,
  ];
}

function numbers(plan: PlanWithSteps, steps: readonly PlanStep[]): string {
  return steps.map((s) => stepNumber(plan, s.id)).join(', ');
}

/** What the approval covers without asking the owner again, and the marked points. */
function permissionLines(plan: PlanWithSteps, delegated: boolean): string[] {
  const steps = stepsOf(plan);
  const free = steps.filter((s) => !s.ask_owner);
  const owners = steps.filter((s) => s.ask_owner);
  const lines = [
    free.length === 0
      ? 'მფლობელის კითხვის გარეშე: არცერთი ნაბიჯი — ყველა მის სიტყვას საჭიროებს.'
      : `მფლობელის კითხვის გარეშე აკეთებ: ნაბიჯები ${numbers(plan, free)} — მათი წესებიც ` +
        '(დასახელებულის გაცნობა ან კითხვა, შემდეგ ნაბიჯზე გადასვლა). მფლობელს მხოლოდ აცნობებ.',
  ];
  if (owners.length > 0) {
    lines.push(`მფლობელის სიტყვა საჭიროა მხოლოდ: ნაბიჯი ${numbers(plan, owners)} — ჯერ ჰკითხე.`);
  }
  if (delegated) {
    lines.push(
      'მფლობელმა გადაგაბარა („შენ გადაწყვიტე") — გეგმის ფარგლებში წვრილმანზე ნუ ეკითხები.',
    );
  }
  return lines;
}

export function renderWhereWeAre(input: WhereWeAreInput): string {
  const { plan } = input;
  const lines = [
    `შედეგი, როცა: ${plan.result_when ?? plan.solved_when}`,
    ...currentAndNext(plan, input.currentStepId),
    lastEventLine(plan, input.events),
    ...permissionLines(plan, input.delegated === true),
  ];
  return `\n\n## სად ვართ [გეგმის მსვლელობა — სერვერის ჩანაწერი]\n${lines.join('\n')}\n`;
}
