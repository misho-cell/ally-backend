import { readFileSync } from 'fs';
import { join } from 'path';
import { NO_TITLE_YET, needsRealTitle } from '../threadTitle.service';

/**
 * Board #827 (Giorgi, 4 October): „გამარჯობა", then a real request, and the
 * conversation was still called „გამარჯობა". #8779 group 4: no small-talk word
 * list — the title model says when there is nothing to name yet, and the
 * placeholder stays until a message gives the thread its name.
 */
const src = (...parts: string[]): string => readFileSync(join(__dirname, '..', ...parts), 'utf8');

describe('a conversation with nothing to name yet', () => {
  it('is titled while it carries the placeholder, and keeps a real title', () => {
    expect(needsRealTitle(null)).toBe(true);
    expect(needsRealTitle('ახალი საუბარი')).toBe(true);
    expect(needsRealTitle('New conversation')).toBe(true);
    expect(needsRealTitle('ვოკალის მასწავლებელი, თბილისი')).toBe(false);
  });

  it('gets the placeholder back when the title model sees nothing to name', () => {
    const title = src('threadTitle.service.ts');
    expect(title).toContain(`output exactly \${NO_TITLE_YET}.`);
    expect(title).toContain('if (raw.trim() === NO_TITLE_YET) {');
    expect(title).toContain('await keepThePlaceholder(userId, threadId);');
    expect(NO_TITLE_YET).toBe('NO_TITLE_YET');
  });

  it('is what the message route asks', () => {
    expect(src('..', 'api', 'routes', 'threads.routes.ts')).toContain(
      "thread.type === 'regular' && needsRealTitle(thread.title);",
    );
  });
});
