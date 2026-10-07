import { readFileSync } from 'fs';
import { join } from 'path';
import { bothAskTheClosingQuestion } from '../chat.service';

/**
 * The tester's 39635 (conv 39931): „ask <name> …" sent the ask at once (D316),
 * but the narration the model had written beside its REFUSED propose_task_plan
 * — „first I want one plan approved by you…", with the word „path" — was
 * promoted to the final by the buried-answer rescue.
 */
describe('a refused plan’s narration is not the answer', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('remembers whether the best narration came from a plan round, at both narration sites', () => {
    const marks = chat.split("bestFromPlanRound = roundTools.includes('propose_task_plan');");
    expect(marks).toHaveLength(3);
  });

  it('drops it from the rescue when no plan was actually proposed in the run', () => {
    // T2543: the same condition, now named so the draft road can read it too.
    const at = chat.indexOf(
      'const planNarrationRefused = bestFromPlanRound && !runPlanForReply.has(runId);',
    );
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(chat.indexOf('const buriedAnswer ='));
    expect(chat.slice(at, at + 300)).toContain("bestNarration = '';");
  });
});

/** The prompt seat's 39700 (conv 39998): the plan and „დავიწყო?" twice — in a step and in the final. */
describe('the plan said once when Claude writes the final', () => {
  it('knows when the step and the final both ask the agreed question', () => {
    expect(
      bothAskTheClosingQuestion(
        'ნანას ასისტენტს დაველაპარაკები. დავიწყო?',
        'გეგმა… დავიწყო?',
        'ka',
      ),
    ).toBe(true);
    expect(bothAskTheClosingQuestion('ვეძებ…', 'გეგმა… დავიწყო?', 'ka')).toBe(false);
  });

  it('drops the step in that case', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('bothAskTheClosingQuestion(draft.text, finalText, runLang(runId))');
  });
});
