import { RunLanguage } from './runLanguage';
import { phoneDigits } from './phone';
import { MAX_STEPS, PlanStep, PlanWithSteps, StepAction, planHasSteps, stepsOf } from './planSteps';

/**
 * K1: the plan card shows the steps BRIEFLY — one line, the first few steps
 * numbered, each „action — who", the owner's points marked. Read by the owner
 * deciding whether to approve, so it carries no field names and no ids.
 */

/** Giorgi, 9 Nov: „და კიდევ 2 — who are they?" Every step a plan holds is shown. */
export const MAX_STEPS_SHOWN = MAX_STEPS;

interface StepWords {
  readonly heading: string;
  readonly actions: Readonly<Record<StepAction, string>>;
  readonly ownerMark: string;
  readonly more: (n: number) => string;
}

export const STEP_WORDS: Readonly<Record<RunLanguage, StepWords>> = {
  ka: {
    heading: 'ნაბიჯები',
    actions: {
      [StepAction.Ask]: 'ვკითხავ',
      [StepAction.Introduce]: 'გაცნობას ვთხოვ',
      [StepAction.Search]: 'ქსელში ვეძებ',
      [StepAction.Web]: 'ინტერნეტში ვეძებ',
    },
    ownerMark: '(აქ შენს სიტყვას დაველოდები)',
    more: (n) => `და კიდევ ${n}`,
  },
  en: {
    heading: 'Steps',
    actions: {
      [StepAction.Ask]: 'ask',
      [StepAction.Introduce]: 'ask for an introduction',
      [StepAction.Search]: 'search the network',
      [StepAction.Web]: 'search the web',
    },
    ownerMark: '(I will wait for your word here)',
    more: (n) => `and ${n} more`,
  },
  ru: {
    heading: 'Шаги',
    actions: {
      [StepAction.Ask]: 'спрошу',
      [StepAction.Introduce]: 'попрошу познакомить',
      [StepAction.Search]: 'поищу в сети',
      [StepAction.Web]: 'поищу в интернете',
    },
    ownerMark: '(здесь дождусь твоего слова)',
    more: (n) => `и ещё ${n}`,
  },
  es: {
    heading: 'Pasos',
    actions: {
      [StepAction.Ask]: 'preguntar',
      [StepAction.Introduce]: 'pedir una presentación',
      [StepAction.Search]: 'buscar en la red',
      [StepAction.Web]: 'buscar en internet',
    },
    ownerMark: '(aquí esperaré tu palabra)',
    more: (n) => `y ${n} más`,
  },
};

/**
 * A step's person is named only while the plan still names them. A person the
 * server took out of the plan (a subject boundary, ruled out, a second number)
 * is never shown — the owner must not learn a third person's boundary exists.
 */
function shownName(step: PlanStep, planPhones: ReadonlySet<string>): string | null {
  const name = step.who?.name;
  const phone = step.who?.phone;
  if (name === undefined) return null;
  if (phone !== undefined && !planPhones.has(phoneDigits(phone))) return null;
  return name;
}

function stepText(
  step: PlanStep,
  position: number,
  words: StepWords,
  planPhones: ReadonlySet<string>,
): string {
  const name = shownName(step, planPhones);
  const action = words.actions[step.action];
  const body = name === null ? action : `${action} — ${name}`;
  return step.ask_owner ? `${position}. ${body} ${words.ownerMark}` : `${position}. ${body}`;
}

/** The steps line under the plan sentence, or null for a plan without steps. */
export function planStepsLine(
  plan: PlanWithSteps & { readonly people_to_involve: readonly { readonly phone: string }[] },
  language: RunLanguage,
): string | null {
  if (!planHasSteps(plan)) return null;
  const words = STEP_WORDS[language];
  const planPhones = new Set(plan.people_to_involve.map((p) => phoneDigits(p.phone)));
  const steps = stepsOf(plan);
  const shown = steps
    .slice(0, MAX_STEPS_SHOWN)
    .map((step, index) => stepText(step, index + 1, words, planPhones));
  const hidden = steps.length - shown.length;
  if (hidden > 0) shown.push(words.more(hidden));
  return `${words.heading}: ${shown.join('; ')}.`;
}
