import { readFileSync } from 'fs';
import { join } from 'path';

const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/**
 * 3106 (speed): the reply check's model call no longer waits in line with a
 * database read. (The goal read beside it went with the plan re-offer, #8779 c.)
 */
describe('the reply check runs beside the read that does not need it', () => {
  it('starts the waiting-requests read before the check, and awaits it after', () => {
    const early = chat.indexOf('const requestsEarly = requestsToDeliver(');
    const check = chat.indexOf(
      'const verdict = await verdictForShown(cleanedFinal, earlyVerdict, (text) =>',
    );
    expect(early).toBeGreaterThan(-1);
    expect(early).toBeLessThan(check);
    expect(chat).toContain('notePendingItems(runId, await requestsEarly);');
  });

  it('no longer appends the plan question to a reply (#8779 c)', () => {
    expect(chat).not.toContain('withPlanDecisionAgain');
    expect(chat).not.toContain('openTaskForPlanAgain');
  });
});
