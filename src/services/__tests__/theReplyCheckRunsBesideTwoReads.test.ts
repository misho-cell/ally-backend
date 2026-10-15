import { readFileSync } from 'fs';
import { join } from 'path';

const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/** 3106 (speed): the reply check's model call no longer waits in line with two database reads. */
describe('the reply check runs beside the two reads that do not need it', () => {
  it('starts the waiting-requests read and the goal read before the check', () => {
    const early = chat.indexOf('const requestsEarly = requestsToDeliver(');
    const goal = chat.indexOf('const openTaskForPlanAgain =');
    const check = chat.indexOf(': await moderateReply(cleanedFinal, userId);');
    expect(early).toBeGreaterThan(-1);
    expect(goal).toBeGreaterThan(-1);
    expect(early).toBeLessThan(check);
    expect(goal).toBeLessThan(check);
  });

  it('keeps the plan-again condition as it was, and reads the goal late when it was not read early', () => {
    expect(chat).toContain(
      '!ownerAbsent && replySafe && earlySolved === null && !runPlanForReply.has(runId)',
    );
    expect(chat).toContain('await (openTaskForPlanAgain ?? getOpenTaskByThread(threadId))');
    expect(chat).toContain('notePendingItems(runId, await requestsEarly);');
  });
});
