import { readFileSync } from 'fs';
import { join } from 'path';
import { asksToEndSomething } from '../stopIntent';
import { GOAL_CLOSE_NOT_ASKED } from '../chat.service';

/**
 * The tester's 1108 (33540): a run closed its own goal as a duplicate, nobody
 * asked, and the owner read „I stopped it" under the request they had just
 * made. A run closes a goal only on the owner's own word in that run.
 */
describe('the owner’s word that ends something', () => {
  it.each([
    'გააჩერე',
    'ეს მიზანი დახურე, აღარ მჭირდება',
    'გააუქმე ეს ძებნა',
    'Please close this goal, the doctor called us back and we are fine now',
    'Cancel it',
    'We no longer need this',
    'Закрой эту задачу',
    'Ya no lo necesito',
  ])('„%s" asks to end something', (line) => {
    expect(asksToEndSomething(line)).toBe(true);
  });

  it.each([
    'პედიატრი მჭირდება დიდ დიღომში.',
    'I need an accountant for a small company',
    'Who is a programmer among my contacts?',
    '',
  ])('„%s" does not', (line) => {
    expect(asksToEndSomething(line)).toBe(false);
  });
});

describe('a run that tries to close a goal nobody asked to close', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is refused before the stop path runs, and told what to do instead', () => {
    const guard = chat.indexOf(
      "if (closing && runId !== undefined && !asksToEndSomething(runOwnerLine.get(runId) ?? '')) {",
    );
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
