jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  backgroundQuery: jest.fn(),
  query: jest.fn(),
}));

import { backgroundQuery } from '../../db/postgres/client';
import {
  ENRICHMENT_CONCURRENCY,
  EnrichmentJob,
  fillEnrichmentWorkers,
  queueEnrichmentJob,
  requeueCutOffJobs,
  workOneJob,
} from '../enrichmentQueue';

const mockQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;
const rows = (r: unknown[], rowCount = r.length): never => ({ rows: r, rowCount }) as never;

const JOB_ROW = {
  id: '7',
  user_id: 501,
  user_composite_key: 'k',
  contact_phone: '+995555000001',
  alias: 'ნინო',
  enrich: true,
};

/** 5317 (F10; Misho's yes to Q7): a deploy dropped every saved contact still waiting. */
describe('the enrichment queue in the database', () => {
  beforeEach(() => mockQuery.mockReset());

  it('queues a saved contact as a row', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const job: EnrichmentJob = {
      userId: 501,
      userCompositeKey: 'k',
      contactPhone: '+995555000001',
      alias: 'ნინო',
      enrich: false,
    };
    await queueEnrichmentJob(job);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO contact_enrichment_jobs');
    expect(params).toEqual([501, 'k', '+995555000001', 'ნინო', false]);
  });

  it('claims the oldest queued job once, does it, and marks it done', async () => {
    mockQuery.mockResolvedValueOnce(rows([JOB_ROW])).mockResolvedValueOnce(rows([]));
    const work = jest.fn().mockResolvedValue(undefined);
    await expect(workOneJob(work)).resolves.toBe(true);
    expect(String(mockQuery.mock.calls[0][0])).toContain('FOR UPDATE SKIP LOCKED');
    expect(work).toHaveBeenCalledWith({
      userId: 501,
      userCompositeKey: 'k',
      contactPhone: '+995555000001',
      alias: 'ნინო',
      enrich: true,
    });
    expect(mockQuery.mock.calls[1][1]).toEqual(['7', 'done', null]);
  });

  it('marks a failed job failed and keeps going', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockResolvedValueOnce(rows([JOB_ROW])).mockResolvedValueOnce(rows([]));
    await expect(workOneJob(() => Promise.reject(new Error('enrich failed')))).resolves.toBe(true);
    expect(mockQuery.mock.calls[1][1]).toEqual(['7', 'failed', 'enrich failed']);
  });

  it('answers false when nothing is queued', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await expect(workOneJob(jest.fn())).resolves.toBe(false);
  });

  it('queues again what a restart cut off mid-job', async () => {
    mockQuery.mockResolvedValueOnce(rows([], 3));
    await expect(requeueCutOffJobs()).resolves.toBe(3);
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "SET status = 'queued', started_at = NULL",
    );
  });

  it('runs four workers once a contact is queued, and starts no more while they are busy', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await queueEnrichmentJob({
      userId: 501,
      userCompositeKey: 'k',
      contactPhone: '+995555000001',
      alias: 'ნინო',
      enrich: true,
    });
    mockQuery.mockReturnValue(new Promise(() => undefined) as never);
    expect(fillEnrichmentWorkers(jest.fn())).toBe(ENRICHMENT_CONCURRENCY);
    expect(fillEnrichmentWorkers(jest.fn())).toBe(0);
  });
});
