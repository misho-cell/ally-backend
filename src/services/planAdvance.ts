import { RunLanguage } from './runLanguage';
import {
  NamedAction,
  PlanStep,
  PlanWithSteps,
  StepAction,
  nextInOrder,
  stepAsksPhone,
  stepById,
  stepNumber,
  stepsOf,
} from './planSteps';

/**
 * Autonomy stage 2, K3: what a step's own rule says happens next, and the short
 * event the goal is woken with. Pure — the database side is planAdvance.service.
 *
 * No owner question is generated here: the plan the owner approved already said
 * what to do on silence, on a no and on a name. A step the plan marked
 * `ask_owner` is the one place the event sends the run to the owner.
 */

/** What ended a step without a result. */
export enum StepEnd {
  Declined = 'declined',
  Silent = 'silent',
}

/**
 * The step the plan goes to when this one ends this way, or null when the plan
 * says nothing more. A step that asks one person ends on that person's no or
 * silence; the „ask everyone" step of an old plan never ends on one person.
 */
export function stepAfter(plan: PlanWithSteps, stepId: string, end: StepEnd): PlanStep | null {
  const step = stepById(plan, stepId);
  if (step === null) return null;
  if (end === StepEnd.Silent) {
    return step.on_silence === undefined ? null : stepById(plan, step.on_silence.next_step);
  }
  if (step.who?.phone === undefined) return null;
  return step.on_no === undefined
    ? nextInOrder(plan, stepId)
    : stepById(plan, step.on_no.next_step);
}

/**
 * The step a message to this person belongs to: the first step from the current
 * one on that asks one of their numbers; else the current „ask everyone" step;
 * else an earlier step that asked them (recorded, never moved back to).
 */
export function stepForRecipient(
  plan: PlanWithSteps,
  currentId: string | null,
  phones: readonly string[],
): PlanStep | null {
  const steps = stepsOf(plan);
  const from = Math.max(
    0,
    steps.findIndex((s) => s.id === currentId),
  );
  const asksThem = (s: PlanStep): boolean => phones.some((p) => stepAsksPhone(s, p));
  const ahead = steps.slice(from).find(asksThem);
  if (ahead !== undefined) return ahead;
  const current = steps[from];
  if (current.action === StepAction.Ask && current.who === undefined) return current;
  return steps.slice(0, from).find(asksThem) ?? null;
}

/** True when moving to this step goes forward (or starts the plan). */
export function isForward(plan: PlanWithSteps, currentId: string | null, nextId: string): boolean {
  if (currentId === null) return true;
  return stepNumber(plan, nextId) > stepNumber(plan, currentId);
}

interface AdvanceWords {
  readonly started: (n: number, body: string) => string;
  readonly actions: Readonly<Record<StepAction, string>>;
  readonly because: Readonly<Record<StepEnd, (n: number) => string>>;
  readonly onYourOwn: string;
  readonly ownersWord: string;
  readonly answered: (n: number) => string;
  readonly resultCheck: string;
  readonly named: Readonly<Record<NamedAction, string>>;
  readonly nextIs: (n: number, body: string) => string;
}

const ADVANCE_WORDS: Readonly<Record<RunLanguage, AdvanceWords>> = {
  ka: {
    started: (n, body) => `ნაბიჯი ${n} დაიწყო: ${body}.`,
    actions: {
      [StepAction.Ask]: 'კითხვა',
      [StepAction.Introduce]: 'გაცნობის თხოვნა',
      [StepAction.Search]: 'ქსელში ძებნა',
      [StepAction.Web]: 'ვებ-ძიება',
    },
    because: {
      [StepEnd.Declined]: (n) => `(ნაბიჯ ${n}-ზე უარი მოვიდა.)`,
      [StepEnd.Silent]: (n) => `(ნაბიჯ ${n}-ზე პასუხი ვადაში არ მოვიდა.)`,
    },
    onYourOwn: 'გეგმა დამტკიცებულია — გააკეთე ახლა, მფლობელის კითხვის გარეშე.',
    ownersWord:
      'ეს ნაბიჯი გეგმაში მფლობელის სიტყვაზეა მონიშნული: ჯერ ერთი წინადადებით ჰკითხე და დაელოდე.',
    answered: (n) => `ნაბიჯ ${n}-ზე პასუხი მოვიდა.`,
    resultCheck: 'თუ გეგმის შედეგი მიღწეულია — set_task_result.',
    named: {
      [NamedAction.Introduce]:
        'თუ პასუხი ვინმეს ასახელებს — გეგმით გაცნობას ითხოვ, მფლობელის კითხვის გარეშე.',
      [NamedAction.Ask]:
        'თუ პასუხი ვინმეს ასახელებს — გეგმით მას ეკითხები, მფლობელის კითხვის გარეშე.',
    },
    nextIs: (n, body) => `თუ არა — შემდეგი ნაბიჯი ${n}: ${body}.`,
  },
  en: {
    started: (n, body) => `Step ${n} has started: ${body}.`,
    actions: {
      [StepAction.Ask]: 'ask',
      [StepAction.Introduce]: 'ask for an introduction',
      [StepAction.Search]: 'search the network',
      [StepAction.Web]: 'search the web',
    },
    because: {
      [StepEnd.Declined]: (n) => `(Step ${n} got a no.)`,
      [StepEnd.Silent]: (n) => `(Step ${n} got no answer in time.)`,
    },
    onYourOwn: 'The plan is approved — do it now, without asking the owner.',
    ownersWord:
      'The plan marked this step for the owner’s word: ask them first, in one sentence, and wait.',
    answered: (n) => `An answer came on step ${n}.`,
    resultCheck: 'If the plan’s result is met — set_task_result.',
    named: {
      [NamedAction.Introduce]:
        'If the answer names somebody — the plan says ask for the introduction, without asking the owner.',
      [NamedAction.Ask]:
        'If the answer names somebody — the plan says ask them, without asking the owner.',
    },
    nextIs: (n, body) => `If not — the next step is ${n}: ${body}.`,
  },
  ru: {
    started: (n, body) => `Шаг ${n} начался: ${body}.`,
    actions: {
      [StepAction.Ask]: 'вопрос',
      [StepAction.Introduce]: 'просьба познакомить',
      [StepAction.Search]: 'поиск по сети',
      [StepAction.Web]: 'веб-поиск',
    },
    because: {
      [StepEnd.Declined]: (n) => `(На шаге ${n} пришёл отказ.)`,
      [StepEnd.Silent]: (n) => `(На шаге ${n} ответа в срок не было.)`,
    },
    onYourOwn: 'План утверждён — сделай это сейчас, не спрашивая владельца.',
    ownersWord:
      'Этот шаг в плане отмечен для слова владельца: сначала спроси его одной фразой и жди.',
    answered: (n) => `На шаге ${n} пришёл ответ.`,
    resultCheck: 'Если результат плана достигнут — set_task_result.',
    named: {
      [NamedAction.Introduce]:
        'Если в ответе кто-то назван — по плану попроси знакомство, не спрашивая владельца.',
      [NamedAction.Ask]:
        'Если в ответе кто-то назван — по плану спроси его, не спрашивая владельца.',
    },
    nextIs: (n, body) => `Если нет — следующий шаг ${n}: ${body}.`,
  },
  es: {
    started: (n, body) => `Ha empezado el paso ${n}: ${body}.`,
    actions: {
      [StepAction.Ask]: 'preguntar',
      [StepAction.Introduce]: 'pedir una presentación',
      [StepAction.Search]: 'buscar en la red',
      [StepAction.Web]: 'buscar en internet',
    },
    because: {
      [StepEnd.Declined]: (n) => `(El paso ${n} recibió un no.)`,
      [StepEnd.Silent]: (n) => `(El paso ${n} no tuvo respuesta a tiempo.)`,
    },
    onYourOwn: 'El plan está aprobado — hazlo ahora, sin preguntar al dueño.',
    ownersWord:
      'El plan marcó este paso para la palabra del dueño: pregúntale primero, en una frase, y espera.',
    answered: (n) => `Llegó una respuesta en el paso ${n}.`,
    resultCheck: 'Si el resultado del plan se cumple — set_task_result.',
    named: {
      [NamedAction.Introduce]:
        'Si la respuesta nombra a alguien — el plan dice pedir la presentación, sin preguntar al dueño.',
      [NamedAction.Ask]:
        'Si la respuesta nombra a alguien — el plan dice preguntarle, sin preguntar al dueño.',
    },
    nextIs: (n, body) => `Si no — el siguiente paso es ${n}: ${body}.`,
  },
};

const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

/** „ask — Ana (what)": the step in a few words. */
function stepBody(step: PlanStep, words: AdvanceWords): string {
  const who = step.who?.name === undefined ? '' : ` — ${step.who.name}`;
  const what = step.what === undefined ? '' : ` (${step.what})`;
  return `${words.actions[step.action]}${who}${what}`;
}

function perLanguage(text: (words: AdvanceWords) => string): Record<RunLanguage, string> {
  const out = {} as Record<RunLanguage, string>;
  for (const language of LANGUAGES) out[language] = text(ADVANCE_WORDS[language]);
  return out;
}

/** The event a goal is woken with when the server moved it to a new step. */
export function stepStartedEvent(
  plan: PlanWithSteps,
  step: PlanStep,
  after?: { readonly stepId: string; readonly end: StepEnd },
): Record<RunLanguage, string> {
  const n = stepNumber(plan, step.id);
  return perLanguage((words) =>
    [
      after === undefined ? '' : words.because[after.end](stepNumber(plan, after.stepId)),
      words.started(n, stepBody(step, words)),
      step.ask_owner ? words.ownersWord : words.onYourOwn,
    ]
      .filter((part) => part !== '')
      .join(' '),
  );
}

/** The line added to an answer's wake: the step's own rule for what comes next. */
export function stepAnsweredNote(
  plan: PlanWithSteps,
  stepId: string,
): Record<RunLanguage, string> | null {
  const step = stepById(plan, stepId);
  if (step === null) return null;
  const next = nextInOrder(plan, stepId);
  return perLanguage((words) =>
    [
      words.answered(stepNumber(plan, stepId)),
      words.resultCheck,
      step.on_named === undefined ? '' : words.named[step.on_named.action],
      next === null ? '' : words.nextIs(stepNumber(plan, next.id), stepBody(next, words)),
    ]
      .filter((part) => part !== '')
      .join(' '),
  );
}

/** An event with the step's line after it, in every language the event has. */
export function withStepNote(
  event: string | Readonly<Record<RunLanguage, string>>,
  note: Readonly<Record<RunLanguage, string>> | null,
): string | Record<RunLanguage, string> {
  if (note === null) return typeof event === 'string' ? event : { ...event };
  const out = {} as Record<RunLanguage, string>;
  for (const language of LANGUAGES) {
    const base = typeof event === 'string' ? event : event[language];
    out[language] = `${base}\n\n${note[language]}`;
  }
  return out;
}
