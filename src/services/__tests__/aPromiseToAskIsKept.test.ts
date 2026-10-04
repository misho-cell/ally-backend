import { readFileSync } from 'fs';
import { join } from 'path';
import {
  asksToApproveAPlan,
  promisesToWriteToSomeone,
  PROMISED_ACTION_NUDGE,
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
      'if (toolNamesUsed.some((name) => ACTING_TOOLS.has(name))) return false;',
    );
    expect(body).toContain('goal.plan === null');
    expect(body).toContain('goal.plan_proposed === null');
    expect(chat).toContain('? PROMISED_ACTION_NUDGE');
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
    expect(chat).toContain(
      'if (!promisesToWriteToSomeone(finalText) && !asksToApproveAPlan(finalText)) return false;',
    );
  });
});
