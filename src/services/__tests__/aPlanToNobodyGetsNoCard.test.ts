import { readFileSync } from 'fs';
import { join } from 'path';
import {
  choicesWithoutPlanCard,
  PLAN_WRITES_TO_NOBODY_NOTE,
  withoutPlanClosingQuestion,
} from '../chat.service';
import { APPROVE_LABEL, CHANGE_LABEL } from '../choiceNotes';
import { PLAN_CLOSING_QUESTION } from '../taskPlans.service';

/**
 * D626 (the founder, 4 October, the tester's 1133 row 3): an approve card only
 * when the plan would really send something to a person. A plan that names
 * nobody ends on the answer — no closing question, no approve or change.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const PLAN_TEXT = 'ვეძებ ამ გზებით — შენი ქსელი. ჯერ არავის ვწერ.';

describe('the buttons under a plan that names nobody', () => {
  it('lose the approve and change pair and keep the rest', () => {
    expect(choicesWithoutPlanCard([APPROVE_LABEL.ka, CHANGE_LABEL.ka, 'სხვა ქალაქი'])).toEqual([
      'სხვა ქალაქი',
    ]);
  });

  it('are no row at all when the pair was everything', () => {
    expect(choicesWithoutPlanCard([APPROVE_LABEL.en, CHANGE_LABEL.en])).toBeUndefined();
    expect(choicesWithoutPlanCard(undefined)).toBeUndefined();
  });
});

describe('the reply under a plan that names nobody', () => {
  it('ends on the answer, without the plan question', () => {
    const reply = `ვიპოვე ორი სანოტარო ბიურო ვებზე.\n\n${PLAN_CLOSING_QUESTION.ka}`;
    expect(withoutPlanClosingQuestion(reply, 'ka', PLAN_TEXT)).toBe(
      'ვიპოვე ორი სანოტარო ბიურო ვებზე.',
    );
  });

  it('drops a reworded closing question too, the earlier wording included', () => {
    const reply = 'Two firms are listed below.\nShall I follow this plan and act on it now?';
    expect(withoutPlanClosingQuestion(reply, 'en', PLAN_TEXT)).toBe('Two firms are listed below.');
  });

  it('leaves a reply without the question as it was', () => {
    expect(withoutPlanClosingQuestion('Nothing else to add.', 'en', PLAN_TEXT)).toBe(
      'Nothing else to add.',
    );
  });

  it('falls back to the plan sentences when the question was all it said', () => {
    expect(withoutPlanClosingQuestion(PLAN_CLOSING_QUESTION.ka, 'ka', PLAN_TEXT)).toBe(PLAN_TEXT);
  });
});

describe('the run that proposed it', () => {
  it('tells the model no approval is needed, and the final assembly obeys', () => {
    expect(PLAN_WRITES_TO_NOBODY_NOTE).toContain('needs no approval');
    expect(chat).toContain('if (stored.people_to_involve.length === 0) {');
    expect(chat).toContain('notePlanWritesToNobody(runId, plainPlan);');
    expect(chat).toContain(': choicesWithoutPlanCard(loopChoices);');
    expect(chat).toContain(': withoutPlanClosingQuestion(effectiveFinal, language, planToNobody);');
    // #925: the engine's plan turn that saved such a plan writes no second message —
    // 48092: unless the answer before it only offered buttons and so had said nothing.
    expect(chat).toContain(
      ": ownerAbsent && !(await lastAnswerAskedSomething(threadId))\n        ? ''",
    );
    const at = chat.indexOf('async function lastAnswerAskedSomething(');
    const fn = chat.slice(at, at + 900);
    expect(fn).toContain('return Array.isArray(row.choices) && row.choices.length > 0;');
    expect(fn).toContain('if (row === undefined) return true;');
  });
});
