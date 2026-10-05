import { readFileSync } from 'fs';
import { join } from 'path';

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
    const at = chat.indexOf('if (bestFromPlanRound && !runPlanForReply.has(runId)) {');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(chat.indexOf('const buriedAnswer ='));
    expect(chat.slice(at, at + 300)).toContain("bestNarration = '';");
  });
});
