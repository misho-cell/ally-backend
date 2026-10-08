import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 3334 (the tester's 46668, 3 of 5): answers that landed during a deploy's
 * switch-over waited for the new process's first five-minute sweep, and the
 * owners stopped the goals before it came. A new process now sweeps 30 s and
 * 90 s after it starts.
 */
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

describe('answers that landed during a deploy', () => {
  it('are swept soon after the new process starts, then on the usual rhythm', () => {
    expect(engine).toContain('const BOOT_ANSWER_SWEEPS_MS: readonly number[] = [30_000, 90_000];');
    const boot = engine.slice(engine.indexOf('for (const delay of BOOT_ANSWER_SWEEPS_MS) {'));
    expect(boot.slice(0, 300)).toContain('sweepUnwokenAnswers()');
    expect(engine).toContain('const UNWOKEN_SWEEP_INTERVAL_MS = 5 * 60_000;');
  });
});
