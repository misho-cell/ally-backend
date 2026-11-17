import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's thermos goal, 17 Nov: her answer to the plan („I want to go
 * through people I know") was searched on the web as a new request, and five
 * names from those results were looked up in her contacts.
 */
describe('a line in a conversation whose goal is open', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('starts no opening search and no web answer', () => {
    expect(chat).toContain(
      'const followUp = autoGoalId === null && (await isAFollowUpInAGoal(threadId));',
    );
    expect(chat).toContain(": ownerAbsent || followUp || userMessage.trim() === ''");
    expect(chat).toContain('!ownerAbsent && !followUp && worldAnswerIsDue(');
  });

  it('is a follow-up only when the goal is open and already answered', () => {
    expect(chat).toContain('if ((await getOpenTaskByThread(threadId)) === null) return false;');
    expect(chat).toContain("WHERE thread_id = $1 AND role = 'assistant'");
    expect(chat).toContain('return answered.rows[0]?.answered === true;');
  });

  it('searches as before when the goal cannot be read', () => {
    expect(chat).toMatch(/goal not read:[\s\S]{0,80}return false;/u);
  });
});
