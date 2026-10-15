jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  backgroundQuery: jest.fn(),
  query: jest.fn(),
}));

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { backgroundQuery } from '../../db/postgres/client';
import {
  ENRICHMENT_CONCURRENCY,
  fillEnrichmentWorkers,
  PAUSE_AFTER_QUEUE_ERROR_MS,
} from '../enrichmentQueue';

const mockQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;
const MIGRATIONS = join(__dirname, '..', '..', 'db', 'postgres', 'migrations');
const QUEUE = readFileSync(join(__dirname, '..', 'enrichmentQueue.ts'), 'utf8');

/**
 * 0355's first night (15 Oct, 21:27–21:55): enrichment_jobs was already the
 * nightly job's table, the queue's own was never made, and the ticker started
 * four workers every five seconds into „column "user_id" does not exist".
 */
describe('the enrichment queue after a queue error', () => {
  it('starts no worker until the pause is over', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('column "user_id" does not exist'));
    const now = Date.now();
    expect(fillEnrichmentWorkers(jest.fn(), ENRICHMENT_CONCURRENCY, now)).toBe(
      ENRICHMENT_CONCURRENCY,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(fillEnrichmentWorkers(jest.fn(), ENRICHMENT_CONCURRENCY, now)).toBe(0);
    const later = Date.now() + PAUSE_AFTER_QUEUE_ERROR_MS + 1;
    expect(fillEnrichmentWorkers(jest.fn(), ENRICHMENT_CONCURRENCY, later)).toBe(
      ENRICHMENT_CONCURRENCY,
    );
  });

  it('uses its own table, never the nightly job’s', () => {
    expect(QUEUE).not.toMatch(/(INTO|UPDATE|FROM) enrichment_jobs\b/);
    const own = readdirSync(MIGRATIONS).find((f) => f.startsWith('243_'));
    expect(own).toBe('243_contact_enrichment_jobs.sql');
    expect(readFileSync(join(MIGRATIONS, String(own)), 'utf8')).toContain(
      'CREATE TABLE IF NOT EXISTS contact_enrichment_jobs',
    );
  });
});
