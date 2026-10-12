import { readFileSync } from 'fs';
import { join } from 'path';
import { retellsThePlansTalks } from '../chat.service';

/** 2909 (box 54162, conv 50220): a step told the plan two seconds before the plan message. */
describe('the plan is told once', () => {
  it('knows a step that announces the plan’s talks', () => {
    expect(
      retellsThePlansTalks(
        'ამასთან ერთად, ელენესა და რატის ასისტენტებს დავველაპარაკები და ვკითხავ, ხომ არ იცნობენ ბუღალტერს.',
      ),
    ).toBe(true);
    expect(retellsThePlansTalks("I will talk to Elene's and Rati's assistants.")).toBe(true);
  });

  it('leaves every other step alone', () => {
    expect(retellsThePlansTalks('🔍 კონტაქტებში ვეძებ: „ბუღალტერი"…')).toBe(false);
    expect(retellsThePlansTalks('ორი ბუღალტერი ვიპოვე შენს კონტაქტებში.')).toBe(false);
  });

  it('drops such steps only when this run’s reply is the plan with its question', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '} else if (!buriedAnswer && finalText.includes(PLAN_CLOSING_QUESTION[runLang(runId)])) {',
    );
    expect(chat).toContain('draftSteps.filter((step) => retellsThePlansTalks(step.text))');
  });
});
