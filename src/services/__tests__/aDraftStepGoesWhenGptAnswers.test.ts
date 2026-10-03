import { readFileSync } from 'fs';
import { join } from 'path';
import { isAnswerRound } from '../chat.service';

/**
 * The tester's 1108 (33538, 33560): Claude's answer, written beside the
 * closing tool, was saved as a step, and GPT's answer from the same material
 * stood under it in other words. The draft step goes when GPT's answer stands.
 */
describe('a draft step written beside the closing tool', () => {
  it('is a round that offers buttons or a plan', () => {
    expect(isAnswerRound(['present_choices'])).toBe(true);
    expect(isAnswerRound(['propose_task_plan', 'present_choices'])).toBe(true);
    expect(isAnswerRound(['search_by_tag', 'search_second_degree'])).toBe(false);
    expect(isAnswerRound([])).toBe(false);
  });

  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is remembered at both places a step is saved', () => {
    const remembered = chat.split(
      'if (isAnswerRound(roundTools)) draftSteps.push({ id: stepId, text: narration });',
    );
    expect(remembered.length - 1).toBe(2);
  });

  it('is dropped only when GPT’s non-empty answer stands and nothing was promoted', () => {
    expect(chat).toContain(
      "if (finalIsRewrite && !buriedAnswer && finalText.trim() !== '') {\n" +
        '    await dropDraftSteps(userId, threadId, runId, draftSteps);',
    );
  });

  it('is taken off the open screen too', () => {
    const fn = chat.slice(chat.indexOf('async function dropDraftSteps('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('await deleteMessage(step.id);');
    expect(body).toContain('emitStepRetracted(userId, threadId, runId, step.text);');
  });
});
