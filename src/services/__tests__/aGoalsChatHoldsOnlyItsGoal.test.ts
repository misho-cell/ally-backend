import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Lika's podcast test (12 Nov, B01): two waiting introduction requests about
 * other people — a finance recommendation and another introduction — were
 * delivered into the owner's podcast goal. A goal's conversation is that goal's
 * alone: waiting requests are not delivered there. Each keeps its own
 * conversation and the pending list, so none goes unanswerable.
 */
describe('a goal’s conversation', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('reads whether the conversation holds an open goal once, for the owner and for an event alike', () => {
    expect(chat).toContain('const threadHoldsAGoal =');
    expect(chat).toContain('const createTaskHeld = !ownerAbsent && threadHoldsAGoal;');
  });

  it('is not where waiting requests are delivered', () => {
    expect(chat).toMatch(
      /requestsToDeliver\(\s*userId,\s*agentPrompt\.deliverRequestsSeparately && !threadHoldsAGoal,/,
    );
  });
});
