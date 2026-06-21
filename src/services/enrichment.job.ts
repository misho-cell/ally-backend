import { query } from '../db/postgres/client';
import { computeAndSaveUserScores, enrichContact } from './enrichment.service';

const RELATIONSHIP_BATCH_SIZE = 200;
const ENRICHMENT_CONCURRENCY = 10;
const ENRICHMENT_BATCH_DELAY_MS = 200;
const CRON_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UserRow {
  user_id: number;
  user_phone: string;
}

interface JobStats {
  total: number;
  processed: number;
  failed: number;
}

export interface JobStatus {
  jobId: string | null;
  running: boolean;
  status: string | null;
  total: number | null;
  processed: number;
  failed: number;
  startedAt: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createJobRecord(jobType: string): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO enrichment_jobs (job_type, status, started_at)
     VALUES ($1, 'running', NOW()) RETURNING id`,
    [jobType],
  );
  return result.rows[0].id;
}

async function updateJobProgress(jobId: string, stats: JobStats): Promise<void> {
  await query('UPDATE enrichment_jobs SET processed = $1, failed = $2, total = $3 WHERE id = $4', [
    stats.processed,
    stats.failed,
    stats.total,
    jobId,
  ]);
}

async function finalizeJob(jobId: string, status: string, stats: JobStats): Promise<void> {
  await query(
    `UPDATE enrichment_jobs
     SET status = $1, completed_at = NOW(), processed = $2, failed = $3
     WHERE id = $4`,
    [status, stats.processed, stats.failed, jobId],
  );
}

async function getUserBatch(offset: number, limit: number): Promise<UserRow[]> {
  const result = await query<UserRow>(
    `SELECT up."userId" AS user_id, up.phone AS user_phone
     FROM "UserPhone" up
     ORDER BY up."userId"
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

async function getUserBatchWithNewContacts(offset: number, limit: number): Promise<UserRow[]> {
  const result = await query<UserRow>(
    `SELECT DISTINCT up."userId" AS user_id, up.phone AS user_phone
     FROM "UserPhone" up
     JOIN "UserAlias" ua ON ua."contactId" = up."userId"
     LEFT JOIN contact_relationship_scores crs
       ON crs.user_id = up."userId" AND crs.contact_phone = ua.phone
     WHERE crs.user_id IS NULL
     ORDER BY up."userId"
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

async function processRelationshipBatch(users: UserRow[], stats: JobStats): Promise<void> {
  for (const user of users) {
    try {
      await computeAndSaveUserScores(user.user_id, user.user_phone);
      stats.processed++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[enrichment] Failed scores for user ${user.user_id}:`, (err as Error).message);
      stats.failed++;
    }
  }
}

async function getUnenrichedPhones(limit: number, offset: number): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT ua.phone
     FROM "UserAlias" ua
     LEFT JOIN contact_enrichment ce ON ce.phone = ua.phone
     WHERE ce.phone IS NULL
     ORDER BY ua.phone
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows.map((r) => r.phone);
}

async function getAllPhones(limit: number, offset: number): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT phone FROM "UserAlias" ORDER BY phone LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows.map((r) => r.phone);
}

async function enrichBatch(phones: string[], stats: JobStats): Promise<void> {
  for (let i = 0; i < phones.length; i += ENRICHMENT_CONCURRENCY) {
    const chunk = phones.slice(i, i + ENRICHMENT_CONCURRENCY);
    await Promise.all(
      chunk.map(async (phone) => {
        try {
          await enrichContact(phone);
          stats.processed++;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[enrichment] Failed enrichment for ${phone}:`, (err as Error).message);
          stats.failed++;
        }
      }),
    );
    await sleep(ENRICHMENT_BATCH_DELAY_MS);
  }
}

async function runRelationshipScores(
  jobId: string,
  stats: JobStats,
  incrementalOnly: boolean,
  shouldStop: () => boolean,
): Promise<void> {
  let offset = 0;
  while (!shouldStop()) {
    const users = incrementalOnly
      ? await getUserBatchWithNewContacts(offset, RELATIONSHIP_BATCH_SIZE)
      : await getUserBatch(offset, RELATIONSHIP_BATCH_SIZE);

    if (users.length === 0) break;
    await processRelationshipBatch(users, stats);
    await updateJobProgress(jobId, stats);
    offset += RELATIONSHIP_BATCH_SIZE;
    if (users.length < RELATIONSHIP_BATCH_SIZE) break;
  }
}

async function runEnrichments(
  jobId: string,
  stats: JobStats,
  incrementalOnly: boolean,
  shouldStop: () => boolean,
): Promise<void> {
  let offset = 0;
  while (!shouldStop()) {
    const phones = incrementalOnly
      ? await getUnenrichedPhones(RELATIONSHIP_BATCH_SIZE, offset)
      : await getAllPhones(RELATIONSHIP_BATCH_SIZE, offset);

    if (phones.length === 0) break;
    await enrichBatch(phones, stats);
    await updateJobProgress(jobId, stats);
    offset += RELATIONSHIP_BATCH_SIZE;
    if (phones.length < RELATIONSHIP_BATCH_SIZE) break;
  }
}

export class EnrichmentJob {
  private static running = false;
  private static _shouldStop = false;
  private static currentJobId: string | null = null;
  private static cronTimer: ReturnType<typeof setInterval> | null = null;
  private static stats: JobStats = { total: 0, processed: 0, failed: 0 };

  static async start(jobType: 'full' | 'incremental'): Promise<string> {
    if (this.running) throw new Error('Enrichment job already running');
    const jobId = await createJobRecord(jobType);
    this.currentJobId = jobId;
    this.running = true;
    this._shouldStop = false;
    this.stats = { total: 0, processed: 0, failed: 0 };

    this.runJob(jobId, jobType).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[enrichment] Job error:', (err as Error).message);
    });

    return jobId;
  }

  private static async runJob(jobId: string, jobType: 'full' | 'incremental'): Promise<void> {
    const incremental = jobType === 'incremental';
    const stop = () => this._shouldStop;
    try {
      await runRelationshipScores(jobId, this.stats, incremental, stop);
      await runEnrichments(jobId, this.stats, incremental, stop);
      const status = this._shouldStop ? 'stopped' : 'completed';
      await finalizeJob(jobId, status, this.stats);
      // eslint-disable-next-line no-console
      console.log(
        `[enrichment] Job ${jobId} ${status}: processed=${this.stats.processed} failed=${this.stats.failed}`,
      );
    } catch (err) {
      await finalizeJob(jobId, 'failed', this.stats).catch(() => {});
      throw err;
    } finally {
      this.running = false;
      this.currentJobId = null;
    }
  }

  static async stop(): Promise<void> {
    this._shouldStop = true;
  }

  static async getStatus(): Promise<JobStatus> {
    if (!this.currentJobId) {
      const last = await query<{
        id: string;
        status: string;
        total: number | null;
        processed: number;
        failed: number;
        started_at: string | null;
      }>(
        'SELECT id, status, total, processed, failed, started_at FROM enrichment_jobs ORDER BY created_at DESC LIMIT 1',
      );
      const row = last.rows[0];
      if (!row)
        return {
          jobId: null,
          running: false,
          status: null,
          total: null,
          processed: 0,
          failed: 0,
          startedAt: null,
        };
      return {
        jobId: row.id,
        running: false,
        status: row.status,
        total: row.total,
        processed: row.processed,
        failed: row.failed,
        startedAt: row.started_at,
      };
    }
    return {
      jobId: this.currentJobId,
      running: this.running,
      status: 'running',
      total: this.stats.total,
      processed: this.stats.processed,
      failed: this.stats.failed,
      startedAt: null,
    };
  }

  static startCron(): void {
    if (this.cronTimer !== null) return;
    this.cronTimer = setInterval(() => {
      if (this.running) {
        // eslint-disable-next-line no-console
        console.log('[enrichment] Cron skipped — job already running');
        return;
      }
      this.start('incremental').catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[enrichment] Cron start error:', (err as Error).message);
      });
    }, CRON_INTERVAL_MS);
    // eslint-disable-next-line no-console
    console.log('[enrichment] Daily cron started (24h interval)');
  }

  static stopCron(): void {
    if (this.cronTimer !== null) {
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }
  }
}
