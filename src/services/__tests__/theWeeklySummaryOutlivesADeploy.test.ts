import { readFileSync } from 'fs';
import { join } from 'path';
import { inWeeklySummaryWindow } from '../taskEngine.service';

/**
 * #4786 (the tester's 06:40Z, Mon 19 Oct): a deploy at 06:00Z cut the run two
 * people in, and the new container, booted at 06:00:30, set next Monday.
 */
describe('#4786: the weekly summary outlives a deploy', () => {
  it('is due from Monday 06:00 UTC until Tuesday 06:00 UTC', () => {
    expect(inWeeklySummaryWindow(new Date('2026-10-19T05:59:00Z'))).toBe(false);
    expect(inWeeklySummaryWindow(new Date('2026-10-19T06:00:30Z'))).toBe(true);
    expect(inWeeklySummaryWindow(new Date('2026-10-19T23:30:00Z'))).toBe(true);
    expect(inWeeklySummaryWindow(new Date('2026-10-20T05:59:00Z'))).toBe(true);
    expect(inWeeklySummaryWindow(new Date('2026-10-20T06:00:00Z'))).toBe(false);
    expect(inWeeklySummaryWindow(new Date('2026-10-18T06:00:00Z'))).toBe(false);
  });

  it('is asked on the five-minute poll and claimed in the database', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    expect(engine).toContain('claimSweep(SWEEP_WEEKLY_SUMMARY, WEEKLY_SUMMARY_CLAIM_MINUTES)');
    expect(engine).not.toContain('msUntilWeeklySummary');
  });
});
