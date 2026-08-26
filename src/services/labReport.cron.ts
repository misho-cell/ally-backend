import { generateAndStoreWeeklyReport, currentWeekStartISO } from './labReport.service';

// Ticket 6, engine T16: "the report generates itself weekly... no hands."
// Fires once a week, Monday 03:00 UTC — after chorus/task-engine's own
// nightly work, ahead of anyone's Monday morning. Same recursive-setTimeout
// shape as taskEngine.service's own nightly review.

const REPORT_HOUR_UTC = 3;

function msUntilNextMonday(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);
  const daysUntilMonday = (1 - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.getTime() - now.getTime();
}

async function runWeeklyReport(): Promise<void> {
  const weekStart = currentWeekStartISO();
  await generateAndStoreWeeklyReport(weekStart);
  // eslint-disable-next-line no-console
  console.log(`[lab-report] generated for week starting ${weekStart}`);
}

export function startLabReportCron(): void {
  const scheduleNext = (): void => {
    setTimeout(() => {
      void runWeeklyReport()
        .catch((err: unknown) =>
          // eslint-disable-next-line no-console
          console.error('[lab-report] weekly generation failed:', (err as Error).message),
        )
        .finally(scheduleNext);
    }, msUntilNextMonday(REPORT_HOUR_UTC)).unref();
  };
  scheduleNext();

  // eslint-disable-next-line no-console
  console.log('[lab-report] cron started (Monday 03:00 UTC)');
}
