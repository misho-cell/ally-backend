import { readFileSync } from 'fs';
import { join } from 'path';
import { startsTheWriterEarly } from '../chat.service';

/**
 * #8524 (the tester's 82584): „where does X work?" took 11–13 s, about 6 s of
 * it waiting on the writer started beside Claude, though a short answer keeps
 * Claude's words. The writer starts early for small talk and found weather only.
 */
describe('the final writer started beside the first turn', () => {
  it('starts for small talk and for weather already found', () => {
    expect(startsTheWriterEarly(true, false)).toBe(true);
    expect(startsTheWriterEarly(false, true)).toBe(true);
  });

  it('does not start for anything else', () => {
    expect(startsTheWriterEarly(false, false)).toBe(false);
  });

  it('is not started because a person was looked up', () => {
    const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = source.indexOf('const earlyFinal =');
    const decision = source.slice(at, source.indexOf('const firstTurnText', at));
    expect(decision).not.toContain('jobFound');
    expect(decision).not.toContain('weatherAnsweredFromFound');
  });
});
