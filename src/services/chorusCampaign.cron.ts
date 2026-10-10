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
/** After the warm-up has had its chance to fill the target-list cache. */
const OPEN_CAMPAIGNS_AFTER_START_MS = 10 * 60 * 1000;
/**
 * 4295 (plate NEW-4): the daily jobs (warm-tie questions, the stale sweep, the
 * delivery prune) waited a full day for their first run, and a deploy always
 * came first — the campaign questions never went. Each now also runs once
 * soon after start. All three are idempotent: the warm-tie cooldown lives in
 * its query, so a run of deploys asks nobody twice.
 */
export const DAILY_JOBS_AFTER_START_MS = 15 * 60 * 1000;

/** Run now-ish, then on the interval: a deploy never pushes a job past its turn. */
function soonThenEvery(job: () => void, afterStartMs: number, everyMs: number): void {
  setTimeout(job, afterStartMs).unref();
  setInterval(job, everyMs).unref();
}

/** One pass of the campaign opener, logged either way it ends. */
function openCampaignsOnce(): void {
  void openDueCampaigns(TARGET_LIST_LOOKBACK_DAYS)
    .then(({ opened, skipped_no_inviter }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[chorus-cron] opener ran: opened ${opened}, ${skipped_no_inviter} target(s) with no warm inviter`,
      );
    })
    .catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[chorus-cron] openDueCampaigns failed:', (err as Error).message),
    );
}

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
      .then(({ ran, searches, findings, not_attempted, verdict }) => {
        // Silent while switched off — a timer nobody turned on must not write a
        // line every quarter of an hour for the rest of the year.
        if (!ran) return;
        /**
         * ⚠️ THE VERDICT IS PRINTED, NOT JUST RETURNED — 27 September.
         *
         * This line used to carry three numbers and nothing else, and two
         * passes in a row printed „0 searches, 0 findings, 0 steps not
         * attempted". Ten people were selected each time, every one of them
         * with a name and tags. The runner KNEW why — it builds a verdict
         * sentence for exactly this — and the sentence was thrown away at the
         * call site while the numbers that cannot distinguish the causes were
         * kept.
         *
         * So a pass that did nothing now says why it did nothing, in the same
         * line. A pass that worked keeps the short form: the whole point of
         * the quiet-by-default rule above is that a job running all night must
         * not bury the log.
         */
        const nothingHappened = searches === 0 && findings === 0 && not_attempted === 0;
        // eslint-disable-next-line no-console
        console.log(
          `[research] ${searches} searches, ${findings} findings, ` +
            `${not_attempted} steps not attempted` +
            (nothingHappened ? ` — ${verdict}` : ''),
        );
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[research] failed:', (err as Error).message),
      );
  }, RESEARCH_INTERVAL_MS).unref();

  // Chorus, 2 October: with six-hourly opening only, a server that deploys
  // more often than every six hours never opened a campaign at all — the
  // interval restarts with every deploy. It also runs once soon after start;
  // the daily cap (campaignsOpenedToday) keeps a run of deploys from opening
  // more than a day allows.
  setTimeout(openCampaignsOnce, OPEN_CAMPAIGNS_AFTER_START_MS).unref();
  setInterval(openCampaignsOnce, OPEN_CAMPAIGNS_INTERVAL_MS).unref();

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

  soonThenEvery(
    () => {
      void queueWarmTieQuestions(WARM_TIE_BATCH_LIMIT)
        .then((queued) => {
          // eslint-disable-next-line no-console
          if (queued > 0) console.log(`[chorus-cron] queued ${queued} warm-tie question(s)`);
        })
        .catch((err: unknown) =>
          // eslint-disable-next-line no-console
          console.error('[chorus-cron] queueWarmTieQuestions failed:', (err as Error).message),
        );
    },
    DAILY_JOBS_AFTER_START_MS,
    SWEEP_INTERVAL_MS,
  );

  soonThenEvery(
    () => {
      void prunePushDeliveries()
        .then((removed) => {
          // eslint-disable-next-line no-console
          if (removed > 0) console.log(`[push] pruned ${removed} old delivery record(s)`);
        })
        .catch((err: unknown) =>
          // eslint-disable-next-line no-console
          console.error('[push] delivery prune failed:', (err as Error).message),
        );
    },
    DAILY_JOBS_AFTER_START_MS,
    SWEEP_INTERVAL_MS,
  );

  soonThenEvery(
    () => {
      void sweepStaleParticipants()
        .then(({ timedOut, closed }) => {
          // eslint-disable-next-line no-console
          if (timedOut > 0)
            console.log(`[chorus-cron] timed out ${timedOut} silent participant(s)`);
          // eslint-disable-next-line no-console
          if (closed > 0) console.log(`[chorus-cron] closed ${closed} empty/expired campaign(s)`);
        })
        .catch((err: unknown) =>
          // eslint-disable-next-line no-console
          console.error('[chorus-cron] sweepStaleParticipants failed:', (err as Error).message),
        );
    },
    DAILY_JOBS_AFTER_START_MS,
    SWEEP_INTERVAL_MS,
  );

  // eslint-disable-next-line no-console
  console.log(
    '[chorus-cron] started (open 6h; send 15min; warm-tie + sweep daily, first 15 min after start)',
  );
}
