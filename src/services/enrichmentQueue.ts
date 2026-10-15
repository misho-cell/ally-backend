import { backgroundQuery } from '../db/postgres/client';

/**
 * The tester's 47594 (8 Oct): every saved card started its own score and
 * enrichment in the background, with no limit, on the pool the owner's own
 * requests use — a 500-card import queued hundreds of them behind each other
 * and in front of everybody else. They now run a few at a time (two until the launch load, four since); the rest wait
 * their turn in order, in the database since 5317. A failure is the job's own to
 * log and never stops the queue.
 */
export const ENRICHMENT_CONCURRENCY = 4;

/**
 * The 21 Oct launch (the tester's 60358, F10; Misho's yes to Q7, 15 Oct): a
 * hundred phonebooks of one to three thousand numbers each would queue a model
 * call per new number for hours. One owner's new numbers are enriched up to
 * this many a day; the rest are still saved and scored, and are enriched when
 * someone else saves them or on a later day's import.
 */
export const ENRICHMENTS_PER_OWNER_PER_DAY = 200;
const enrichedToday = new Map<number, { readonly day: string; count: number }>();

/** Whether this owner's next new number may be enriched today; counts it when yes. */
export function takeEnrichmentAllowance(
  ownerId: number,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  const seen = enrichedToday.get(ownerId);
  if (seen === undefined || seen.day !== today) {
    enrichedToday.set(ownerId, { day: today, count: 1 });
    return true;
  }
  if (seen.count >= ENRICHMENTS_PER_OWNER_PER_DAY) return false;
  seen.count += 1;
  return true;
}

/** One saved contact waiting for its score, and its enrichment when the owner's share allows. */
export interface EnrichmentJob {
  readonly userId: number;
  readonly userCompositeKey: string;
  readonly contactPhone: string;
  readonly alias: string;
  readonly enrich: boolean;
}

/** What a worker does with one job; the real one is in contacts.service. */
export type EnrichmentWork = (job: EnrichmentJob) => Promise<void>;

/**
 * 5317 (F10; Misho's yes to Q7): the queue used to live in this process's
 * memory, so a deploy dropped every saved contact still waiting. Jobs are rows
 * now (contact_enrichment_jobs): queued here, claimed by the workers in arrival order,
 * and a job a restart cut off is queued again when the workers start.
 */
const QUEUE_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 300;
/** A job still „running" this long after it started was cut off by a restart. */
const CUT_OFF_AFTER_MINUTES = 10;
const TICK_INTERVAL_MS = 5_000;
/**
 * 0355's first night: the queue's statements failed on every claim, and the
 * ticker started four fresh workers every five seconds into the same error —
 * 1,390 log lines in half an hour. After a worker stops on a queue error, no
 * worker starts again for this long.
 */
export const PAUSE_AFTER_QUEUE_ERROR_MS = 60_000;

let workersRunning = 0;
let pausedUntil = 0;

/** Queues one saved contact. */
export async function queueEnrichmentJob(job: EnrichmentJob): Promise<void> {
  await backgroundQuery(
    `INSERT INTO contact_enrichment_jobs (user_id, user_composite_key, contact_phone, alias, enrich)
     VALUES ($1, $2, $3, $4, $5)`,
    [job.userId, job.userCompositeKey, job.contactPhone, job.alias, job.enrich],
    QUEUE_TIMEOUT_MS,
  );
}

interface JobRow {
  readonly id: string;
  readonly user_id: number;
  readonly user_composite_key: string;
  readonly contact_phone: string;
  readonly alias: string;
  readonly enrich: boolean;
}

/** The oldest queued job, marked running in the same statement so no other worker takes it. */
async function claimNextJob(): Promise<JobRow | null> {
  const result = await backgroundQuery<JobRow>(
    `UPDATE contact_enrichment_jobs SET status = 'running', started_at = NOW()
      WHERE id = (SELECT id FROM contact_enrichment_jobs WHERE status = 'queued'
                   ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id, user_id, user_composite_key, contact_phone, alias, enrich`,
    [],
    QUEUE_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function finishJob(id: string, error: string | null): Promise<void> {
  await backgroundQuery(
    `UPDATE contact_enrichment_jobs SET status = $2, error = $3, finished_at = NOW() WHERE id = $1`,
    [id, error === null ? 'done' : 'failed', error],
    QUEUE_TIMEOUT_MS,
  );
}

/** Takes the next job and does it; false when nothing was queued. A failed job is the job's own. */
export async function workOneJob(work: EnrichmentWork): Promise<boolean> {
  const row = await claimNextJob();
  if (row === null) return false;
  try {
    await work({
      userId: row.user_id,
      userCompositeKey: row.user_composite_key,
      contactPhone: row.contact_phone,
      alias: row.alias,
      enrich: row.enrich,
    });
    await finishJob(row.id, null);
  } catch (err) {
    const message = (err as Error).message.slice(0, MAX_ERROR_CHARS);
    // eslint-disable-next-line no-console
    console.error('[enrichment] job failed:', message);
    await finishJob(row.id, message);
  }
  return true;
}

async function workUntilEmpty(work: EnrichmentWork): Promise<void> {
  workersRunning += 1;
  try {
    while (await workOneJob(work)) {
      // the next queued job, straight away
    }
  } catch (err) {
    pausedUntil = Date.now() + PAUSE_AFTER_QUEUE_ERROR_MS;
    // eslint-disable-next-line no-console
    console.error('[enrichment] worker stopped:', (err as Error).message);
  } finally {
    workersRunning -= 1;
  }
}

/** Starts workers up to the limit, unless a queue error paused them; each one ends when the queue is empty. */
export function fillEnrichmentWorkers(
  work: EnrichmentWork,
  workers: number = ENRICHMENT_CONCURRENCY,
  now: number = Date.now(),
): number {
  if (now < pausedUntil) return 0;
  let started = 0;
  while (workersRunning < workers) {
    void workUntilEmpty(work);
    started += 1;
  }
  return started;
}

/** Queues again what a restart cut off mid-job. */
export async function requeueCutOffJobs(): Promise<number> {
  const result = await backgroundQuery(
    `UPDATE contact_enrichment_jobs SET status = 'queued', started_at = NULL
      WHERE status = 'running' AND started_at < NOW() - ($1 || ' minutes')::interval`,
    [CUT_OFF_AFTER_MINUTES],
    QUEUE_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

/** At start: what a restart cut off goes back in the queue, and the ticker keeps the workers topped up. */
export function startEnrichmentWorkers(work: EnrichmentWork): void {
  void requeueCutOffJobs()
    .then((requeued) => {
      if (requeued > 0) {
        // eslint-disable-next-line no-console
        console.log(`[enrichment] ${requeued} job(s) cut off by a restart are queued again`);
      }
    })
    .catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[enrichment] could not requeue cut-off jobs:', (err as Error).message),
    );
  setInterval(() => fillEnrichmentWorkers(work), TICK_INTERVAL_MS).unref();
}
