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
    expect(route).not.toMatch(/await updateThreadTitle\(threadId, provisional/u);
    expect(route).toMatch(
      /const titled = needsTitle\s+\? updateThreadTitle\(threadId, provisional\)/u,
    );
    expect(route).toContain('titled.catch(() => undefined);');
  });

  /**
   * 5321 (the 50-seat run, 17 Oct): the 202 waited for the title as well as the
   * wallet, 1.3–1.8 s of a 2.5 s accept. The 202 waits for the wallet only; the
   * run starts after the title, and the list is told the title when it lands.
   */
  it('is awaited before the run, not before the 202', () => {
    const awaited = route.indexOf('await titled.catch(() => undefined);');
    expect(awaited).toBeGreaterThan(
      route.indexOf('res.status(202).json({ success: true, runId })'),
    );
    expect(awaited).toBeGreaterThan(route.indexOf('await leaveIntakeLane(async () => {'));
    expect(awaited).toBeLessThan(
      route.indexOf('keepUserMessage(userId, threadId, message);', awaited),
    );
    expect(route).toContain('emitThreadUpdated(userId, { id: threadId, title: provisional })');
  });
});
