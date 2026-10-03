import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 1100 (round 5, GPT writing the answers).
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('1 — „what is new?" with nothing new', () => {
  it('says so in the result instead of an item list nobody can read as empty', () => {
    expect(chat).toContain('const nothingNew = updates.length === 0 && curiosity === null;');
    expect(chat).toContain(
      '...(nothingNew && { nothing_new: true, nothing_new_note: NOTHING_NEW_NOTE }),',
    );
    expect(chat).toContain('never call those new answers');
  });
});

describe('2 — a plan reply carries the plan’s own buttons', () => {
  it('is applied to the run’s buttons before the reply is assembled', () => {
    expect(chat).toContain('const choices = planButtonsWhenMissing(runId, loopChoices);');
    const assembled = chat.indexOf(
      'effectiveFinal = withPlanInReply(runId, effectiveFinal, choices);',
    );
    expect(
      chat.indexOf('const choices = planButtonsWhenMissing(runId, loopChoices);'),
    ).toBeLessThan(assembled);
  });

  it('adds approve and change only when the reply has none, or has the closing question as one', () => {
    const fn = chat.slice(chat.indexOf('export function planButtonsWhenMissing('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain(
      'if (!runPlanForReply.has(runId) || replyAsksForApproval(offered)) return offered;',
    );
    expect(body).toContain(
      'if ((offered ?? []).length > 0 && !asksTheClosingQuestion) return offered;',
    );
    expect(body).toContain('return [APPROVE_LABEL[language], CHANGE_LABEL[language]];');
  });
});
