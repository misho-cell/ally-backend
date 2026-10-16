import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Run 9 (16 Oct, 200 „გამარჯობა" at once): outside the load every accept phase
 * was a multiple of ~150 ms, one round trip each, and the provisional title
 * waited for the thread while the wallet waited for the title. The title now
 * goes beside the wallet check and is awaited before any reply is sent.
 */
describe('the provisional title on an arriving message', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
    'utf8',
  );

  it('is started without waiting for it', () => {
    expect(route).not.toMatch(/await updateThreadTitle\(threadId, provisionalTitle/u);
    expect(route).toMatch(/const titled = needsTitle\s+\? updateThreadTitle\(/u);
    expect(route).toContain('titled.catch(() => undefined);');
  });

  it('is awaited after the wallet check and before the 402 or the 202', () => {
    const awaited = route.indexOf('await titled;');
    expect(awaited).toBeGreaterThan(route.indexOf('checkRunAllowance(payerId)'));
    expect(awaited).toBeLessThan(route.indexOf('res.status(402)'));
    expect(awaited).toBeLessThan(route.indexOf('res.status(202).json({ success: true, runId })'));
  });
});
