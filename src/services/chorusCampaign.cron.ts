import {
  openDueCampaigns,
  sendDueCampaignAsks,
  sweepStaleParticipants,
} from './chorusCampaign.service';
import { walkBaseOnce } from './basePool.service';
import { runResearchOnce } from './researchRunner.service';
import { prunePushDeliveries } from './notification.service';
import { queueWarmTieQuestions } from './warmth.service';

// Ticket 6, engine T8 ("Chorus"): "fully automatic, no manual mode" — every
// step below runs off a timer, the same shape as taskEngine.service's own
// ticker (setInterval + .unref(), errors caught and logged, never thrown).

/**
 * Ticket 19: one batch of the base walk, often enough to cross 62,000 accounts
 * in a few days and slowly enough that nobody notices. It runs on the
 * background pool's own two connections, so the only thing it can ever slow
 * down is itself.
 */
const BASE_WALK_INTERVAL_MS = Number(process.env.BASE_POOL_WALK_INTERVAL_MS ?? 5 * 60 * 1000);

/**
 * Ticket 19 [20]: one tick of the automatic research.
 *
 * Slower than the base walk because every step is a paid search. The tick does
 * nothing at all unless RESEARCH_RUNNER is „on", so this timer is harmless
 * until somebody decides to spend — which is the point: the decision to start
 * spending is a person's, not a deploy's.
 */
const RESEARCH_INTERVAL_MS = Number(process.env.RESEARCH_INTERVAL_MS ?? 15 * 60 * 1000);

const OPEN_CAMPAIGNS_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — matches T7's own weekly cadence closely enough without a cron-schedule dependency
const SEND_ASKS_INTERVAL_MS = 15 * 60 * 1000; // 15min — staggered asks land within a reasonable window of their scheduled day
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const TARGET_LIST_LOOKBACK_DAYS = 30;
const SEND_ASKS_BATCH_LIMIT = 50;
// Source 2 of warmth (ticket 9 task 13.1): the question that keeps the warm
// pool from starving. Daily, and only for users whose pool is actually thin —
// the cooldown lives in the query, not here.
const WARM_TIE_BATCH_LIMIT = 25;

// A deploy restarts the process and empties the in-process target-list cache;
// the first admin read then pays the full ~2-minute unmet-needs scan (ticket 8
// task 13.9). Warm it shortly after boot — the same call the 6h opener makes,
// so with TARGET_LIST_CACHE_TTL_MINUTES raised to match the 6h cadence the
// admin routes read warm around the clock.
const WARM_TARGET_LIST_AFTER_MS = 2 * 60 * 1000;

export function startChorusCampaignCron(): void {
  setTimeout(() => {
    void import('./targetScoring.service')
      .then(({ buildTargetList }) => buildTargetList(TARGET_LIST_LOOKBACK_DAYS))
      .then((entries) => {
        // eslint-disable-next-line no-console
        console.log(`[chorus-cron] target-list cache warmed (${entries.length} targets)`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[chorus-cron] target-list warmup failed:', (err as Error).message),
      );
  }, WARM_TARGET_LIST_AFTER_MS).unref();

  setInterval(() => {
    void walkBaseOnce()
      .then(({ examined, written, wrapped }) => {
        // Quiet by default: a line only when the pass finds something or ends,
        // so a job that runs all night does not bury the log.
        // eslint-disable-next-line no-console
        if (wrapped) console.log('[base-walk] reached the end of the base, starting again');
        // eslint-disable-next-line no-console
        else if (written > 0) console.log(`[base-walk] ${written} of ${examined} qualified`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[base-walk] failed:', (err as Error).message),
      );
  }, BASE_WALK_INTERVAL_MS).unref();

  setInterval(() => {
    void runResearchOnce()
      .then(({ ran, searches, findings, not_attempted }) => {
        // Silent while switched off — a timer nobody turned on must not write a
        // line every quarter of an hour for the rest of the year.
        if (!ran) return;
        // eslint-disable-next-line no-console
        console.log(
          `[research] ${searches} searches, ${findings} findings, ` +
            `${not_attempted} steps not attempted`,
        );
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[research] failed:', (err as Error).message),
      );
  }, RESEARCH_INTERVAL_MS).unref();

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
    void queueWarmTieQuestions(WARM_TIE_BATCH_LIMIT)
      .then((queued) => {
        // eslint-disable-next-line no-console
        if (queued > 0) console.log(`[chorus-cron] queued ${queued} warm-tie question(s)`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[chorus-cron] queueWarmTieQuestions failed:', (err as Error).message),
      );
  }, SWEEP_INTERVAL_MS).unref();

  setInterval(() => {
    void prunePushDeliveries()
      .then((removed) => {
        // eslint-disable-next-line no-console
        if (removed > 0) console.log(`[push] pruned ${removed} old delivery record(s)`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[push] delivery prune failed:', (err as Error).message),
      );
  }, SWEEP_INTERVAL_MS).unref();

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
  console.log('[chorus-cron] started (open 6h; send 15min; warm-tie + sweep daily)');
}
