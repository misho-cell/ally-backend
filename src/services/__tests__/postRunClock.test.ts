import { lap, postRunLine, startPostRunClock } from '../postRunClock';

/** 958: the four seconds after the tool loop, named step by step. */
describe('the post-run clock', () => {
  it('gives each step its own time and the whole after the loop', () => {
    const clock = startPostRunClock(1_000);
    lap(clock, 'trail', 1_150);
    lap(clock, 'moderation', 2_400);
    lap(clock, 'stored', 2_500);
    expect(postRunLine('r1', clock, 2_520)).toBe(
      '[post-run] run r1: trail 150ms, moderation 1250ms, stored 100ms; total 1520ms',
    );
  });

  it('says only the total when no step was marked', () => {
    expect(postRunLine('r2', startPostRunClock(10), 40)).toBe('[post-run] run r2: ; total 30ms');
  });
});
