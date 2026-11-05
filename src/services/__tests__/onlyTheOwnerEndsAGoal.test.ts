import { readFileSync } from 'fs';
import { join } from 'path';
import { GOAL_CLOSE_NOT_ASKED } from '../chat.service';

/**
 * The tester's 1108 (33540): a run closed its own goal as a duplicate, nobody
 * asked, and the owner read „I stopped it" under the request they had just
 * made. A run closes a goal only in the owner's own turn.
 *
 * #8779 group b, rule 31 (the founder, 4 Nov 19:07): no end words. In the
 * owner's turn the model reads whether he means to end it.
 */
describe('a run that tries to close a goal outside the owner’s turn', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is refused before the stop path runs, and told what to do instead', () => {
    const guard = chat.indexOf('if (closing && runId !== undefined && !ownersOwnTurn(runId)) {');
    const stop = chat.indexOf('? (await stopGoal(userId, toStop, runLang(runId))).stopped');
    expect(guard).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(guard);
    expect(GOAL_CLOSE_NOT_ASKED).toContain('where that goal stands');
  });

  it('remembers only the owner’s own line, never a system run’s', () => {
    expect(chat).toContain('if (!ownerAbsent) runOwnerLine.set(runId, userMessage);');
    expect(chat).toContain('runOwnerLine.delete(runId);');
  });
});
