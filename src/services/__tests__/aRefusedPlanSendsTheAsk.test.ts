import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 694 re-opened (the master test run's 45679; §99.5): „ask <name> …" went plan
 * → refused → permission → send, 50–60 s. The refusal now sends the question.
 */
describe('a plan refused because the owner named one person', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('sends the one question through the §97 path and says it went', () => {
    expect(chat).toContain('return refusedPlanOrSentAsk(userId, threadId, runId);');
    expect(chat).toContain(
      "const outcome = await sendInstructedAsk(userId, threadId, runOwnerLine.get(runId) ?? '').catch(",
    );
    expect(chat).toContain('the server has already sent ');
    expect(chat).toContain('Do not call grant_task_permission or ask_contact for it.');
  });

  it('keeps the old refusal when the server cannot send', () => {
    expect(chat).toContain('if (outcome?.result !== InstructedAskResult.Sent) return refused;');
    expect(chat).toContain('    error: NO_PLAN_FOR_AN_INSTRUCTION,\n  };');
  });
});
