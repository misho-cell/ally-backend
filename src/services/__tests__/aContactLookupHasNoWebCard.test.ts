import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #1356 (Lika, 5 Oct): „find everything on [contact]" showed a raw server
 * bubble — „Found on the web: … your contact there — [an unrelated contact] …
 * check it is the same person" — before the answer. The card belongs to a
 * goal's opening search only.
 */
describe('the „From the web" card', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is built only from a run whose goal opened a search', () => {
    expect(chat).toContain('buildFromTheWebMessage(webCardFor(runId), language)');
    expect(chat).toContain('return fromGoal ? waysIn : new Map<string, WayIn>();');
  });

  it('is marked when the opening search starts, and cleared with the run', () => {
    expect(chat).toContain(
      '  runWebCardFromGoal.add(runId);\n  void runOpeningSearches(userId, goalText, runId, threadId)',
    );
    expect(chat).toContain('  runWebCardFromGoal.delete(runId);\n');
  });
});
