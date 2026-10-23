/**
 * #7236 retest (tester 73758, goal 31421): „მოვრჩეთ ეს ამბავი" on a waiting
 * plan — the reply said „ვწყვეტ", no tool closed the goal, it stayed open.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { asksToEndSomething, replySaysItStopped } from '../stopIntent';

describe('an end the owner asked for and the reply confirmed closes the goal', () => {
  it('reads the 31421 pair as both signs', () => {
    expect(asksToEndSomething('მოვრჩეთ ეს ამბავი')).toBe(true);
    expect(replySaysItStopped('კარგი, ვწყვეტ ამ საქმეს.')).toBe(true);
    expect(replySaysItStopped('OK, I have stopped it.')).toBe(true);
  });

  it('does not read a reply that only goes on with the work as a stop', () => {
    expect(replySaysItStopped('ლიკას აღარ მივწერ, დანარჩენებთან ვაგრძელებ.')).toBe(false);
    expect(replySaysItStopped('ვეძებ სხვა გზებს.')).toBe(false);
  });

  it('closes through the stop button’s path, without a second line, only on both signs', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const helper = chat.slice(chat.indexOf('async function closeWhatTheReplySaysItStopped'));
    expect(helper.slice(0, 900)).toContain(
      'if (!asksToEndSomething(ownerLine) || !replySaysItStopped(reply)) return;',
    );
    expect(helper.slice(0, 1200)).toContain('await stopGoal(userId, open, language, false);');
    const stop = readFileSync(join(__dirname, '..', 'goalStop.service.ts'), 'utf8');
    expect(stop).toContain('if (wasOpen && announce) {');
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
