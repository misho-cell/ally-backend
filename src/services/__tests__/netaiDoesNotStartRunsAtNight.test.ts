import { readFileSync } from 'fs';
import { join } from 'path';
import { isQuietHour, DEFAULT_PUSH_TIME_ZONE } from '../pushQuietHours';

/**
 * #7234 (tester, 25 Oct: Tornike's thread 63410 got a scheduled check-in at
 * 02:23 Tbilisi). Runs Netai starts on its own wait out the quiet hours.
 */
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

describe('runs Netai starts on its own', () => {
  it('are quiet at 02:23 Tbilisi and free at noon', () => {
    expect(isQuietHour(new Date('2026-10-24T22:23:00Z'), DEFAULT_PUSH_TIME_ZONE)).toBe(true);
    expect(isQuietHour(new Date('2026-10-25T08:00:00Z'), DEFAULT_PUSH_TIME_ZONE)).toBe(false);
  });

  it('wait in the wake tick and in the hourly sweeps', () => {
    expect(engine).toContain(
      'async function tick(): Promise<void> {\n  if (ownRunsWait()) return;',
    );
    expect(engine).toContain('const runHourlySweeps = (): void => {');
    expect(engine).toMatch(
      /runHourlySweeps = \(\): void => \{\n[^\n]*\n\s+if \(ownRunsWait\(\)\) return;/u,
    );
    expect(engine).toContain('return isQuietHour(now, DEFAULT_PUSH_TIME_ZONE);');
  });

  it('review goals at 09:30 Tbilisi, not inside the quiet hours', () => {
    expect(engine).toContain('const NIGHTLY_REVIEW_HOUR_UTC = 5;');
  });
});
