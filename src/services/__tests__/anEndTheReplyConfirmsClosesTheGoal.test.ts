import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #8779 group b, rule 31 (the founder, 4 Nov 19:07): the server no longer closes a
 * goal because the owner's line and the reply both held stop words; in the owner's
 * turn the model closes it with update_task.
 */
describe('#8779 (rule 31): no close from stop words in the reply', () => {
  it('has no server close that reads the reply’s words', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).not.toContain('closeWhatTheReplySaysItStopped');
    expect(chat).not.toContain('replySaysItStopped');
  });
});

describe('#7236 second retest (73791): a whole-goal end is the server’s stop', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { looksLikeStopRequest, looksLikeWholeGoalEnd } = require('../stopIntent');

  it.each([
    'მოვრჩეთ ეს ამბავი',
    'არა არ მინდა მოვრჩეთ ეს ამბავი',
    'დავასრულოთ',
    'აღარ მინდა ეს საქმე',
    'კარგი, დავხუროთ',
  ])('is answered by the server: %s', (line: string) => {
    expect(looksLikeWholeGoalEnd(line)).toBe(true);
    expect(looksLikeStopRequest(line)).toBe(true);
  });

  it.each([
    'ლიკას აღარ მინდა მისწერო',
    'მოვრჩეთ ლიკასთან და ნინოს მიწერე',
    'აღარ მინდა თბილისში',
    'სახლში კარგი ელექტრიკოსი მჭირდება',
  ])('is not: %s', (line: string) => {
    expect(looksLikeWholeGoalEnd(line)).toBe(false);
  });
});
