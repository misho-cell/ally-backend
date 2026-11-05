import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * RW-012 B (MTR #7, goal 20759): the owner closed the goal; the run's own
 * follow-up reopened it a minute later and it woke a day after to write to
 * him. Only his own turn reopens a closed goal.
 *
 * #8779 group b, rule 32 (the founder, 4 Nov 19:07): no reopen words. In the
 * owner's own turn the model reads whether he means to go on; a wake or a
 * system run still cannot reopen it.
 */
describe('a closed goal stays closed unless the owner reopens it (RW-012 B, #8779)', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('reads the owner’s own turn, not a list of words', () => {
    expect(chat).not.toContain('asksToReopen');
    expect(chat).toMatch(
      /function ownersOwnTurn\(runId: string\): boolean \{\s+return \(runOwnerLine\.get\(runId\) \?\? ''\)\.trim\(\) !== '';/,
    );
  });

  it('update_task refuses a reopen outside the owner’s turn, before anything is written', () => {
    const guard = chat.indexOf(
      "if (status === 'open' && runId !== undefined && !ownersOwnTurn(runId)) {",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(
      chat.indexOf("return { updated: false, refused: 'goal_closed_by_owner' };", guard),
    ).toBeGreaterThan(guard);
    expect(
      chat.indexOf('const toStop = closing ? await getTaskById(taskIdToUpdate) : null;'),
    ).toBeGreaterThan(guard);
  });
});
