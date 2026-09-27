/**
 * A STOP THAT IS OBEYED TWICE AND IGNORED ON THE THIRD PASS IS NOT A STOP.
 *
 * The nightly enrichment job has three passes. The first two take the stop
 * callback and check it every loop. The third does not take one — it is a
 * single call:
 *
 *     if (incremental && !this._shouldStop) {
 *       const moderation = await reclassifyPrivateNotes(null, MAX_NOTE_MODERATION_PER_RUN);
 *
 * and `reclassifyPrivateNotes` PUBLISHES private notes it judges safe, up to
 * 500 of them, with no way to be interrupted once it starts. So that one `if`
 * is the entire difference between „the operator pressed stop and the job
 * stood down" and „the operator pressed stop and 500 people's private notes
 * were moderated afterwards anyway". The job then writes `status = 'stopped'`
 * over the top of it, which is the part that makes it invisible.
 *
 * ⚠️ FOUND BY `sabotage.py` ON 27 SEPTEMBER, in block mode:
 *
 *     if (incremental && !this._shouldStop) {   ->   if (false) {
 *
 * and the whole suite stayed green — `enrichment.job.ts` had no test of its own
 * at all; the only file in the repo that named `EnrichmentJob` was the
 * heartbeat's.
 *
 * BOTH HALVES OF THE CONDITION ARE HELD HERE, because they are two different
 * promises. `!_shouldStop` is the stop. `incremental &&` is the cap: the sweep
 * is bounded per run so the backlog drains over several nights, and an
 * admin-started `full` job that also ran it would spend that night's budget
 * twice.
 */
const dbQuery = jest.fn();
const reclassify = jest.fn();

jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  backgroundQuery: (...args: unknown[]) => dbQuery(...args),
  query: (...args: unknown[]) => dbQuery(...args),
}));
jest.mock('../../db/neo4j/client', () => ({
  __esModule: true,
  getSession: jest.fn(),
}));
jest.mock('../enrichment.service', () => ({
  __esModule: true,
  computeAndSaveUserScores: jest.fn().mockResolvedValue(undefined),
  enrichContact: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../neo4j.keys', () => ({
  __esModule: true,
  getCompositeKeysForUsers: jest.fn().mockResolvedValue(new Map()),
  getCompositeKeysForPhones: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  reclassifyPrivateNotes: (...args: unknown[]) => reclassify(...args),
}));

import { EnrichmentJob } from '../enrichment.job';

/** The job's own cap on one night's moderation sweep. */
const MAX_NOTE_MODERATION_PER_RUN = 500;

const JOB_ID = 'job-1';

/** Resolves when the job writes its final row, whatever the status. */
let finalStatus: Promise<string>;

beforeEach(() => {
  jest.clearAllMocks();
  reclassify.mockResolvedValue({ scanned: 0, published: 0, remaining: 0 });

  finalStatus = new Promise<string>((resolve) => {
    dbQuery.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO enrichment_jobs')) {
        return Promise.resolve({ rows: [{ id: JOB_ID }], rowCount: 1 });
      }
      if (sql.includes('SET status = $1')) {
        resolve(String(params[0]));
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      // Every batch query answers „nothing left", so both interruptible passes
      // fall straight through and the test is about the third one only.
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });
});

describe('the nightly moderation sweep', () => {
  it('runs on an ordinary incremental night', async () => {
    await EnrichmentJob.start('incremental');

    await expect(finalStatus).resolves.toBe('completed');
    expect(reclassify).toHaveBeenCalledWith(null, MAX_NOTE_MODERATION_PER_RUN);
  });

  it('does not start after the operator has pressed stop', async () => {
    await EnrichmentJob.start('incremental');
    await EnrichmentJob.stop();

    await expect(finalStatus).resolves.toBe('stopped');
    expect(reclassify).not.toHaveBeenCalled();
  });

  /**
   * The other half. A `full` job is admin-started and uncapped; the moderation
   * sweep is capped per run on purpose, and belongs to the nightly one.
   */
  it('does not run on a full job', async () => {
    await EnrichmentJob.start('full');

    await expect(finalStatus).resolves.toBe('completed');
    expect(reclassify).not.toHaveBeenCalled();
  });
});
