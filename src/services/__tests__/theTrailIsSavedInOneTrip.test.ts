import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's fourth 200 run (60530; Misho, 15 Oct): the run's trail was
 * written one row per round trip before the owner saw the answer.
 */
describe("the run's trail", () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('is saved in one statement, before the trail lap', () => {
    const saveAt = chat.indexOf('await saveRunTrail(userId, threadId, pending);');
    expect(saveAt).toBeGreaterThan(-1);
    expect(chat.indexOf("lap(postRun, 'trail');")).toBeGreaterThan(saveAt);
    expect(chat).not.toContain('for (const msg of pending) {');
  });

  it('keeps the written order, a microsecond apart per row, and still marks model-only turns as events', () => {
    const sql = chat.slice(chat.indexOf('const SAVE_TRAIL_SQL'));
    expect(sql).toContain('WITH ORDINALITY AS t(role, content, json, kind, ord)');
    expect(sql).toContain("NOW() + (t.ord * INTERVAL '1 microsecond')");
    expect(chat).toContain("pending.map((msg) => (isSystemTurnOf(msg) ? 'event' : 'message'))");
  });
});
