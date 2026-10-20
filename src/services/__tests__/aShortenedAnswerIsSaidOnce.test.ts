import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #6367 after-test (the tester's 69947, threads 61975 / 61977): the owner read
 * the findings twice — Claude's 1,212-character draft became the reply, was
 * shortened to 434, and the „found nothing" guard then put the whole draft back
 * in front because the short form said „კავშირი ვერ ვიპოვე".
 */
describe('a draft that became the reply and was shortened', () => {
  const source = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const guard = source.slice(source.indexOf('claimsNothingFound(finalText) &&'));

  it('is not put back in front of its own short form', () => {
    expect(guard.slice(0, guard.indexOf(') {'))).toContain('!promoted');
  });
});
