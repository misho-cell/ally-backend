import { readFileSync } from 'fs';
import { join } from 'path';
import { runLatencyLine } from '../runLatency';

/** 958: the seconds around the run, split per answer, with no guessing. */
describe('the latency line', () => {
  it('splits stored→run and run→answer and gives the total', () => {
    expect(runLatencyLine('r1', 50756, 1_000, 3_100, 4_380)).toBe(
      '[latency] run r1 thread 50756: stored→run 2100 ms, run→answer 1280 ms, total 3380 ms',
    );
  });

  it('is written when the answer is handed to the app, for runs that carry a stored time', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    expect(route).toContain('const storedAt = Date.now();');
    const line = route.indexOf('runLatencyLine(runId, threadId, storedAt');
    const emit = route.search(
      /emitRunComplete\(userId, threadId, runId, \{\s*reply: result\.reply,/,
    );
    expect(line).toBeGreaterThan(-1);
    expect(line).toBeLessThan(emit);
    expect(route).toContain('if (storedAt !== undefined) {');
  });
});
