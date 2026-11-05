import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #8948 / #8524 (tester 82831): the tool list changed from one message to the next
 * (web, new goal, relay, invite held back per message), so the prompt cache missed
 * and the first call wrote ~52k tokens again — several seconds each time.
 */
describe('the tool list stays whole from one message to the next', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('sends every tool and refuses the held ones at the call', () => {
    expect(chat).toMatch(/requestAnswerOnly\s+\?[^:]+:\s+tools;/u);
    expect(chat).toContain('if (heldThisTurn.size > 0) runHeldTools.set(runId, heldThisTurn);');
    expect(chat).toContain('(runHeldTools.get(runId)?.has(name) ||');
    // #67 / #8779 group 4: a discussion turn holds every tool but set_discussion, the same way.
    expect(chat).toContain('(runInDiscussion.has(runId) && name !== SET_DISCUSSION_TOOL_NAME))');
    expect(chat).toContain('return { error: TOOL_HELD_THIS_TURN };');
  });

  it('forgets the held tools when the run ends', () => {
    const clear = chat.slice(chat.indexOf('function clearRunState(runId: string): void {'));
    expect(clear.slice(0, clear.indexOf('\n}\n'))).toContain('runHeldTools.delete(runId);');
    expect(clear.slice(0, clear.indexOf('\n}\n'))).toContain('runInDiscussion.delete(runId);');
  });
});
