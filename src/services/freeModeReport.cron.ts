import {
  DueFreeReport,
  claimDueFreeReports,
  freeReportText,
  peopleWrittenToToday,
} from './freeModeReport.service';
import { saveThreadMessage, userLanguage } from './threads.service';

/**
 * Misho, 8 Nov: the free-mode goals' evening reports (freeModeReport.service.ts).
 * One goal's failure never stops the next.
 */
const SWEEP_EVERY_MS = 10 * 60_000;

async function sendReport(goal: DueFreeReport): Promise<void> {
  const people = await peopleWrittenToToday(goal.id);
  const language = await userLanguage(goal.user_id);
  const text = freeReportText(goal.title, people, language);
  if (text === '') return;
  await saveThreadMessage(goal.thread_id, Number(goal.user_id), 'assistant', text);
  // eslint-disable-next-line no-console
  console.log(`[free-report] goal ${goal.id}: evening report sent, ${people.length} people`);
}

export async function sweepFreeReports(): Promise<void> {
  const due = await claimDueFreeReports();
  for (const goal of due) {
    await sendReport(goal).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(`[free-report] goal ${goal.id} failed:`, (err as Error).message),
    );
  }
}

export function startFreeReports(): void {
  const tick = (): void => {
    void sweepFreeReports()
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[free-report] sweep failed:', (err as Error).message),
      )
      .then(() => {
        setTimeout(tick, SWEEP_EVERY_MS).unref();
      });
  };
  setTimeout(tick, SWEEP_EVERY_MS).unref();
}
