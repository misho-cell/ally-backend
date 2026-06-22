import { query } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { computeAndSaveUserScores, enrichContact } from './enrichment.service';
import { getCompositeKeysForUsers, getCompositeKeysForPhones } from './neo4j.keys';

const RELATIONSHIP_BATCH_SIZE = 200;
const ENRICHMENT_CONCURRENCY = 10;
const ENRICHMENT_BATCH_DELAY_MS = 200;
const BACKFILL_NEO4J_BATCH_SIZE = 500;
const CRON_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UserRow {
  user_id: number;
  composite_key: string;
}

interface BackfillRow {
  user_id: number;
  contact_phone: string;
  alias: string;
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

export type JobType = 'full' | 'incremental' | 'neo4j_backfill';

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
    `SELECT "userId" AS user_id,
            STRING_AGG(phone, '-' ORDER BY phone) AS composite_key
     FROM "UserPhone"
     GROUP BY "userId"
     ORDER BY "userId"
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

async function getUserBatchWithNewContacts(offset: number, limit: number): Promise<UserRow[]> {
  const result = await query<UserRow>(
    `SELECT up."userId" AS user_id,
            STRING_AGG(up.phone, '-' ORDER BY up.phone) AS composite_key
     FROM "UserPhone" up
     WHERE EXISTS (
       SELECT 1 FROM "UserAlias" ua
       LEFT JOIN contact_relationship_scores crs
         ON crs.user_id = up."userId" AND crs.contact_phone = ua.phone
       WHERE ua."contactId" = up."userId" AND crs.user_id IS NULL
     )
     GROUP BY up."userId"
     ORDER BY up."userId"
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

async function processRelationshipBatch(users: UserRow[], stats: JobStats): Promise<void> {
  for (const user of users) {
    try {
      await computeAndSaveUserScores(user.user_id, user.composite_key);
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

async function getBackfillBatch(offset: number, limit: number): Promise<BackfillRow[]> {
  const result = await query<BackfillRow>(
    `SELECT DISTINCT ON (ua."contactId", ua.phone)
       ua."contactId" AS user_id,
       ua.phone AS contact_phone,
       ua.alias
     FROM "UserAlias" ua
     ORDER BY ua."contactId", ua.phone, LENGTH(ua.alias) DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

async function runNeo4jBackfill(
  jobId: string,
  stats: JobStats,
  shouldStop: () => boolean,
): Promise<void> {
  let offset = 0;
  while (!shouldStop()) {
    const rows = await getBackfillBatch(offset, BACKFILL_NEO4J_BATCH_SIZE);
    if (rows.length === 0) break;

    const userIds = [...new Set(rows.map((r) => Number(r.user_id)))];
    const contactPhones = [...new Set(rows.map((r) => r.contact_phone))];

    const [userKeyMap, contactKeyMap] = await Promise.all([
      getCompositeKeysForUsers(userIds),
      getCompositeKeysForPhones(contactPhones),
    ]);

    interface MergeRow {
      userKey: string;
      contactKey: string;
      name: string;
    }

    const mergeRows: MergeRow[] = [];
    for (const row of rows) {
      const userKey = userKeyMap.get(Number(row.user_id));
      if (!userKey) continue;
      const contactKey = contactKeyMap.get(row.contact_phone) ?? row.contact_phone;
      mergeRows.push({ userKey, contactKey, name: row.alias });
    }

    if (mergeRows.length > 0) {
      const session = getSession();
      try {
        await session.run(
          `UNWIND $rows AS row
           MERGE (u:AllyNode {phoneKey: row.userKey})
           MERGE (c:AllyNode {phoneKey: row.contactKey})
           MERGE (u)-[r:CONTACT]->(c)
           SET r.name = row.name, r.updatedAt = datetime()`,
          { rows: mergeRows },
          { timeout: 60000 },
        );
        stats.processed += mergeRows.length;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[backfill] Neo4j batch failed:', (err as Error).message);
        stats.failed += mergeRows.length;
      } finally {
        await session.close();
      }
    }

    await updateJobProgress(jobId, stats);
    offset += BACKFILL_NEO4J_BATCH_SIZE;
    if (rows.length < BACKFILL_NEO4J_BATCH_SIZE) break;
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

  static async start(jobType: JobType): Promise<string> {
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

  private static async runJob(jobId: string, jobType: JobType): Promise<void> {
    const stop = () => this._shouldStop;
    try {
      if (jobType === 'neo4j_backfill') {
        await runNeo4jBackfill(jobId, this.stats, stop);
      } else {
        const incremental = jobType === 'incremental';
        await runRelationshipScores(jobId, this.stats, incremental, stop);
        await runEnrichments(jobId, this.stats, incremental, stop);
      }
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
