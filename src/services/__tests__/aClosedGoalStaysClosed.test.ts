import { readFileSync } from 'fs';
import { join } from 'path';
import { asksToReopen } from '../reopenIntent';

/**
 * RW-012 B (MTR #7, goal 20759): the owner closed the goal; the run's own
 * follow-up reopened it a minute later and it woke a day after to write to
 * him. Only his own word reopens a closed goal.
 */
describe('a closed goal stays closed unless the owner reopens it (RW-012 B)', () => {
  it.each([
    'გააგრძელე ეს დავალება',
    'ხელახლა გახსენი',
    'Please reopen it',
    'resume the search',
    'Продолжи',
  ])('„%s" reopens', (line) => expect(asksToReopen(line)).toBe(true));

  it.each(['ეს მოგვარდა, დახურე.', 'ვხურავ დანარჩენ კითხვებს', 'მადლობა', ''])(
    '„%s" does not',
    (line) => expect(asksToReopen(line)).toBe(false),
  );

  it('update_task refuses to reopen a closed goal without that word, before anything is written', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const guard = chat.indexOf("!asksToReopen(runOwnerLine.get(runId) ?? '')");
    expect(guard).toBeGreaterThan(-1);
    expect(
      chat.indexOf("return { updated: false, refused: 'goal_closed_by_owner' };", guard),
    ).toBeGreaterThan(guard);
    expect(
      chat.indexOf('const toStop = closing ? await getTaskById(taskIdToUpdate) : null;'),
    ).toBeGreaterThan(guard);
  });
});
