import { readFileSync } from 'fs';
import { join } from 'path';
import {
  asksToApproveAPlan,
  promisesToWriteToSomeone,
  PROMISED_ACTION_NUDGE,
  PROMISED_ACTION_NO_GOAL_NUDGE,
  withoutClosingApprovalAsk,
  offersToSend,
} from '../replyGuards';

/**
 * Board #830 (the tester's 1135, 37066): „მაკას ვკითხავ ერთ მოკლე
 * რეკომენდაციას" with no plan proposed and nothing sent.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a reply that promises to write to someone', () => {
  it('is recognised in Georgian, English and Russian', () => {
    expect(promisesToWriteToSomeone('მაკას ვკითხავ ერთ მოკლე რეკომენდაციას.')).toBe(true);
    expect(promisesToWriteToSomeone('ნინოს მივწერ და გეტყვი.')).toBe(true);
    expect(promisesToWriteToSomeone("I'll ask Maka for one recommendation.")).toBe(true);
    expect(promisesToWriteToSomeone('Спрошу у Маки.')).toBe(true);
  });

  it('is not a question to the owner, or a reply that promises nothing', () => {
    expect(promisesToWriteToSomeone('მაკას მივწეროთ?')).toBe(false);
    expect(promisesToWriteToSomeone('შენს წრეში ნოტარიუსი ვერ გამოჩნდა.')).toBe(false);
    // #925: „I write to nobody" is the opposite of a promise.
    expect(promisesToWriteToSomeone('გეგმა მზადაა. არავის მივწერ, შენ თვითონ დაუკავშირდები.')).toBe(
      false,
    );
    expect(promisesToWriteToSomeone('ჯერ არ მივწერ არავის.')).toBe(false);
  });

  it('asks once for a plan with that person, or for no promise at all', () => {
    expect(PROMISED_ACTION_NUDGE).toContain('propose_task_plan');
    expect(PROMISED_ACTION_NUDGE).toContain('არაფერს არ დაჰპირდე');
  });

  it('fires only on a planless goal run that called none of the acting tools', () => {
    const fn = chat.slice(chat.indexOf('async function promisedAnActionItDidNotTake('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain(
      'if (toolNamesUsed.some((name) => ACTING_TOOLS.has(name))) return null;',
    );
    expect(body).toContain('goal.plan === null');
    expect(body).toContain('goal.plan_proposed === null');
    expect(chat).toContain(': PROMISED_ACTION_NUDGE');
  });

  /** The tester's 1149 (38068): „გიას ვკითხავ…" in a quick answer, with no goal at all. */
  it('fires in the owner’s quick answer with no goal, with its own note', () => {
    const fn = chat.slice(chat.indexOf('async function promisedAnActionItDidNotTake('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('if (goal === null) return ownersQuickRun ? PromiseGap.Goal : null;');
    expect(chat).toContain("new Set(['quick_answer', 'onboarding'])");
    expect(chat).toContain("OWNERS_QUICK_RUNS.has(runModes.get(runId) ?? '')");
    expect(chat).toContain('? PROMISED_ACTION_NO_GOAL_NUDGE');
    expect(PROMISED_ACTION_NO_GOAL_NUDGE).toContain('set_task_brief');
    expect(PROMISED_ACTION_NO_GOAL_NUDGE).toContain('propose_task_plan');
    expect(PROMISED_ACTION_NO_GOAL_NUDGE).toContain('არაფერს არ დაჰპირდე');
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 300)).toContain('PROMISED_ACTION_NO_GOAL_NUDGE,');
  });

  it('is never shown as the owner’s own words', () => {
    const set = chat.slice(chat.indexOf('export const MODEL_ONLY_NUDGES'));
    expect(set.slice(0, 300)).toContain('PROMISED_ACTION_NUDGE,');
  });
});

/** #961 (37322): „გეგმის დასამტკიცებლად მითხარი: კი?" with no plan and no card. */
describe('a reply that asks to approve a plan', () => {
  it('is recognised', () => {
    expect(asksToApproveAPlan('გეგმის დასამტკიცებლად მითხარი: კი?')).toBe(true);
    expect(asksToApproveAPlan('Tell me yes to approve the plan.')).toBe(true);
    expect(asksToApproveAPlan('გოჩა შენს კონტაქტებშია.')).toBe(false);
  });

  it('takes the same guard turn when no plan was proposed', () => {
    expect(chat).toContain('asksToApproveAPlan(finalText) ||');
  });
});

/** #961 (37604): nothing can be sent today, so the approval question goes with its button. */
describe('an approval question with no button to answer it', () => {
  it('is recognised in this word order too', () => {
    expect(asksToApproveAPlan('დავამტკიცოთ ეს გეგმა?')).toBe(true);
  });

  it('is taken off, and the answer before it stays', () => {
    expect(withoutClosingApprovalAsk('ლია Netai-ზე არ არის. დავამტკიცოთ ეს გეგმა?')).toBe(
      'ლია Netai-ზე არ არის.',
    );
    expect(withoutClosingApprovalAsk('ლიას მოვიწვევ?')).toBe('ლიას მოვიწვევ?');
  });

  it('runs when the run has nothing to send today', () => {
    expect(chat).toContain('if (runNothingToSend.has(runId)) {');
  });
});

/** #961 (37554): buttons that offer to send, with no plan behind them. */
describe('a button that offers to send', () => {
  it('is recognised, and a negated one is not', () => {
    expect(offersToSend('კი, გაუგზავნე სამივეს')).toBe(true);
    expect(offersToSend('Send to all three')).toBe(true);
    expect(offersToSend('ჯერ არა')).toBe(false);
    expect(offersToSend('ჯერ არ გაუგზავნო')).toBe(false);
  });

  it('takes the same guard turn as a promise', () => {
    expect(chat).toContain('offered.some(offersToSend);');
    expect(chat).toContain(
      "toolNamesUsed,\n          choices ?? [],\n          OWNERS_QUICK_RUNS.has(runModes.get(runId) ?? ''),",
    );
  });
});
