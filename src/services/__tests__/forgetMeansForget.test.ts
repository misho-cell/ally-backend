import { readFileSync } from 'fs';
import { join } from 'path';
import { factForgottenRecently, noteFactForgotten } from '../forgetOnTheOwnersWord';

/**
 * #8521 (the tester's 80752 item 7, case 109): „forget this fact" asked
 * „confirm?" and deleted nothing; then the sweep saved it back (80967).
 * #8779 b (rule 36, the founder 4 Nov 19:07): no forget words — the model's
 * confirmed=true is the owner's order, and the sweep pauses on the tool's note.
 */
describe('the owner’s order to forget', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const handler = chat.slice(chat.indexOf("case 'forget_contact_fact': {"));

  it('deletes on the model’s confirmed reading, and tells it not to ask twice', () => {
    expect(handler.slice(0, 700)).toContain("if (!isConfirmed(input['confirmed'])) {");
    expect(handler.slice(0, 700)).toContain('do not ask them again (#8521)');
    expect(chat).not.toContain('ownerLineOrdersTheForget');
  });

  it('pauses the fact sweep on that conversation once a fact is deleted or retracted', () => {
    const NOW = 1_700_000_000_000;
    expect(factForgottenRecently(4242, NOW)).toBe(false);
    noteFactForgotten(4242, NOW);
    expect(factForgottenRecently(4242, NOW + 60_000)).toBe(true);
    expect(factForgottenRecently(4242, NOW + 6 * 60_000)).toBe(false);
    expect(handler.slice(0, 900)).toContain('noteFactForgotten(threadId);');
    const sweep = readFileSync(join(__dirname, '..', 'factExtraction.service.ts'), 'utf8');
    expect(sweep).toContain('if (factForgottenRecently(threadId)) return;');
  });
});
