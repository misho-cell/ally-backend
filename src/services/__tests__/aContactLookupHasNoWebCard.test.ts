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

  it('is marked when a goal’s opening search starts, and cleared with the run', () => {
    // Misho, 13 Nov: a request with no goal gets the web too, told in the model's own words.
    expect(chat).toContain('  if (taskId !== null) runWebCardFromGoal.add(runId);\n');
    expect(chat).toContain('  runWebCardFromGoal.delete(runId);\n');
  });
});
