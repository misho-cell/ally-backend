import { readFileSync } from 'fs';
import { join } from 'path';
import { QUESTION_ON_SCREEN_NOTE } from '../goalQuestions.service';

/**
 * Plate row 268, goal 11221 (1 Oct 07:35): a silent-goal wake asked the owner
 * a question through ask_owner_decision — the server wrote it to the screen —
 * and the run's closing reply asked it again eight seconds later, with
 * „I am waiting for your answer" on top. Two messages, one question.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('the tool result says the question is already on screen', () => {
  it('forbids asking again, restating, and announcing the wait', () => {
    expect(QUESTION_ON_SCREEN_NOTE).toContain('ALREADY on the owner’s screen');
    expect(QUESTION_ON_SCREEN_NOTE).toContain('Do not ask it again');
    expect(QUESTION_ON_SCREEN_NOTE).toContain('do not write that you are waiting');
    expect(QUESTION_ON_SCREEN_NOTE).toContain('end without a reply');
  });

  it('is returned only when the question was written and flagged', () => {
    const tool = chat.slice(chat.indexOf("case 'ask_owner_decision':"));
    const body = tool.slice(0, tool.indexOf("case 'answer_goal_question':"));
    expect(body).toContain('if (!flagged.flagged) return flagged;');
    expect(body).toContain('noteQuestionIsOnScreen(runId, { rowId, text: question.trim() })');
    expect(body).toContain('return { ...flagged, note: QUESTION_ON_SCREEN_NOTE }');
  });
});

describe('a run that then says nothing more', () => {
  it('ends on the question instead of failing as empty', () => {
    const lift = chat.indexOf('effectiveFinal = (await questionAsFinal(runId)) ??');
    const failure = chat.indexOf('produced an EMPTY final — surfacing as failure');
    expect(lift).toBeGreaterThan(0);
    expect(lift).toBeLessThan(failure);
  });

  it('takes the question’s own row out, so it shows once', () => {
    const fn = chat.slice(chat.indexOf('async function questionAsFinal'));
    expect(fn.slice(0, 600)).toContain('await deleteMessage(question.rowId)');
  });

  it('forgets the question with the rest of the run state', () => {
    const clear = chat.slice(chat.indexOf('function clearRunState'));
    expect(clear.slice(0, 1200)).toContain('runQuestionOnScreen.delete(runId)');
  });
});
