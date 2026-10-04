import { readFileSync } from 'fs';
import { join } from 'path';
import { needsRealTitle } from '../threadTitle.service';

/**
 * Board #827 (Giorgi, 4 October): „გამარჯობა", then a real request, and the
 * conversation was still called „გამარჯობა".
 */
describe('a conversation titled by small talk', () => {
  it('takes its title from the first message that is a real request', () => {
    expect(needsRealTitle('გამარჯობა', 'სიმღერის მასწავლებელი მინდა შვილისთვის')).toBe(true);
  });

  it('keeps its greeting while the talk is still small', () => {
    expect(needsRealTitle('გამარჯობა', 'როგორ ხარ?')).toBe(false);
  });

  it('keeps a real title, and still names an untitled conversation', () => {
    expect(needsRealTitle('ვოკალის მასწავლებელი, თბილისი', 'კიდევ ვინმე?')).toBe(false);
    expect(needsRealTitle(null, 'გამარჯობა')).toBe(true);
  });

  it('is what the message route asks', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    expect(route).toContain("thread.type === 'regular' && needsRealTitle(thread.title, message);");
  });
});
