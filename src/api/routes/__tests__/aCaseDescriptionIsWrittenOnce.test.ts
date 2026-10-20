import { readFileSync } from 'fs';
import { join } from 'path';

/** #6535 (Giorgi, G-128): the description states the owner's problem, written once. */
describe('the case description after a run', () => {
  const routes = readFileSync(join(__dirname, '..', 'threads.routes.ts'), 'utf8');

  it('is written only when the case has none, never rewritten from progress', () => {
    expect(routes).toContain('if (becameTask || openTask !== null) void describeIfMissing(');
    expect(routes).not.toContain('refreshCaseDescription(');
  });
});
