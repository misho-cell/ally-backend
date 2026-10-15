import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3106 (speed). The goal's ask lines read the thread's open goal and then its
 * asks, two round trips after the trail was saved. The run loop is over by
 * then, so the goal is read as the post-run starts, beside the trail.
 */
describe('the open goal is read beside the trail being saved', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const clockAt = chat.indexOf('const postRun = startPostRunClock();');
  const readAt = chat.indexOf('const openTaskAfterLoop = getOpenTaskByThread(threadId);');
  const trailAt = chat.indexOf("lap(postRun, 'trail');");

  it('starts the read after the loop and before the trail is saved', () => {
    expect(clockAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(clockAt);
    expect(trailAt).toBeGreaterThan(readAt);
  });

  it('keeps a failed read from counting as unhandled while the trail saves', () => {
    expect(chat.slice(readAt, trailAt)).toContain('openTaskAfterLoop.catch(() => undefined);');
  });

  it('gives the ask lines that read instead of reading the goal again', () => {
    const fn = chat.slice(chat.indexOf('async function withGoalAskLines('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('const task = await openTask;');
    expect(body).not.toContain('getOpenTaskByThread');
    expect(chat).toContain('withGoalAskLines(effectiveFinal, threadId, openTaskAfterLoop)');
  });
});
