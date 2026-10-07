import { stepClock } from '../stepClock';

/**
 * #958: every run reached the model 1.5–3.8 s after it started, small talk
 * included, and the log gave one total. The steps are marked so the slow one
 * has a name.
 */
const STARTED_AT = 1_000;

function clockAt(times: number[]): () => number {
  return () => times.shift() ?? 0;
}

describe('the steps of a run start', () => {
  it('are told in the order they finished, with the time since the start', () => {
    const steps = stepClock(STARTED_AT, clockAt([1_040, 1_900]));
    steps.mark('thread');
    steps.mark('goal');
    expect(steps.line()).toBe('thread 40, goal 900');
  });

  it('keep their own time when they run side by side', async () => {
    const steps = stepClock(STARTED_AT, clockAt([1_700, 1_200]));
    let finishPrompt: (value: string) => void = () => undefined;
    const prompt = steps.timed(
      'prompt',
      new Promise<string>((resolve) => {
        finishPrompt = resolve;
      }),
    );
    const history = steps.timed('history', Promise.resolve(['a']));
    await history;
    finishPrompt('p');
    await expect(prompt).resolves.toBe('p');
    expect(steps.line()).toBe('prompt 200, history 700');
  });

  it('mark a step that failed and pass its error on', async () => {
    const steps = stepClock(STARTED_AT, clockAt([1_300]));
    await expect(steps.timed('tools', Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(steps.line()).toBe('tools 300');
  });
});
