import { sweepAnswerStats } from './answerStats.service';

/** 1689: every hour, the answer records of everyone whose asks moved lately. */
const SWEEP_EVERY_MS = 60 * 60 * 1000;

export function startAnswerStats(): void {
  const tick = (): void => {
    void sweepAnswerStats()
      .then((n) => {
        if (n > 0) {
          // eslint-disable-next-line no-console
          console.log(`[answer-stats] ${n} record(s) recounted`);
        }
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[answer-stats] sweep failed:', (err as Error).message),
      );
  };
  setInterval(tick, SWEEP_EVERY_MS).unref();
}
