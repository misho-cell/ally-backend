import {
  openDueCampaigns,
  sendDueCampaignAsks,
  sweepStaleParticipants,
} from './chorusCampaign.service';

// Ticket 6, engine T8 ("Chorus"): "fully automatic, no manual mode" — every
// step below runs off a timer, the same shape as taskEngine.service's own
// ticker (setInterval + .unref(), errors caught and logged, never thrown).

const OPEN_CAMPAIGNS_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — matches T7's own weekly cadence closely enough without a cron-schedule dependency
const SEND_ASKS_INTERVAL_MS = 15 * 60 * 1000; // 15min — staggered asks land within a reasonable window of their scheduled day
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const TARGET_LIST_LOOKBACK_DAYS = 30;
const SEND_ASKS_BATCH_LIMIT = 50;

export function startChorusCampaignCron(): void {
  setInterval(() => {
    void openDueCampaigns(TARGET_LIST_LOOKBACK_DAYS)
      .then(({ opened }) => {
        // eslint-disable-next-line no-console
        if (opened > 0) console.log(`[chorus-cron] opened ${opened} campaign(s)`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[chorus-cron] openDueCampaigns failed:', (err as Error).message),
      );
  }, OPEN_CAMPAIGNS_INTERVAL_MS).unref();

  setInterval(() => {
    void sendDueCampaignAsks(SEND_ASKS_BATCH_LIMIT)
      .then((sent) => {
        // eslint-disable-next-line no-console
        if (sent > 0) console.log(`[chorus-cron] sent ${sent} campaign ask(s)`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[chorus-cron] sendDueCampaignAsks failed:', (err as Error).message),
      );
  }, SEND_ASKS_INTERVAL_MS).unref();

  setInterval(() => {
    void sweepStaleParticipants()
      .then(({ timedOut, closed }) => {
        // eslint-disable-next-line no-console
        if (timedOut > 0) console.log(`[chorus-cron] timed out ${timedOut} silent participant(s)`);
        // eslint-disable-next-line no-console
        if (closed > 0) console.log(`[chorus-cron] closed ${closed} empty/expired campaign(s)`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[chorus-cron] sweepStaleParticipants failed:', (err as Error).message),
      );
  }, SWEEP_INTERVAL_MS).unref();

  // eslint-disable-next-line no-console
  console.log('[chorus-cron] started (open 6h; send 15min; sweep daily)');
}
