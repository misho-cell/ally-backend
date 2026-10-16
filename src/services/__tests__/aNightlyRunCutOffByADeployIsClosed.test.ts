jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  backgroundQuery: jest.fn(),
  query: jest.fn(),
}));
jest.mock('../../db/neo4j/client', () => ({ __esModule: true, getSession: jest.fn() }));
jest.mock('../enrichment.service', () => ({
  __esModule: true,
  computeAndSaveUserScores: jest.fn(),
  enrichContact: jest.fn(),
}));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  reclassifyPrivateNotes: jest
    .fn()
    .mockResolvedValue({ scanned: 0, published: 0, remaining: false }),
}));

import { backgroundQuery } from '../../db/postgres/client';
import { EnrichmentJob, mayResumeCutOffRun } from '../enrichment.job';

const mockQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;
const at = (iso: string): Date => new Date(iso);

/** 16 Oct: the 01:00 run was killed by the 01:24 deploy and read „running" until morning. */
describe('a nightly run cut off by a restart', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  beforeEach(() => mockQuery.mockReset());

  it('may start again only the same night, before 03:00 UTC', () => {
    const started = at('2026-10-16T01:00:00Z');
    expect(mayResumeCutOffRun(started, at('2026-10-16T01:24:00Z'))).toBe(true);
    expect(mayResumeCutOffRun(started, at('2026-10-16T02:59:00Z'))).toBe(true);
    expect(mayResumeCutOffRun(started, at('2026-10-16T03:00:00Z'))).toBe(false);
    expect(mayResumeCutOffRun(started, at('2026-10-17T01:24:00Z'))).toBe(false);
    expect(mayResumeCutOffRun(at('2026-10-16T00:30:00Z'), at('2026-10-16T01:24:00Z'))).toBe(false);
  });

  it('is closed as cut off, and left alone when it is too late to start again', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ job_type: 'incremental', started_at: '2026-10-16T01:00:00Z' }]),
    );
    await expect(EnrichmentJob.settleCutOffRun(at('2026-10-16T04:30:00Z'))).resolves.toBe(false);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("SET status = 'failed'");
    expect(String(sql)).toContain("WHERE status = 'running'");
    expect(params).toEqual(['cut off by a restart']);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('starts again when the restart came early in its night', async () => {
    mockQuery
      .mockResolvedValueOnce(
        rows([{ job_type: 'incremental', started_at: '2026-10-16T01:00:00Z' }]),
      )
      .mockResolvedValueOnce(rows([{ id: 'job-1' }]))
      .mockResolvedValue(rows([]));
    await expect(EnrichmentJob.settleCutOffRun(at('2026-10-16T01:24:00Z'))).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(String(mockQuery.mock.calls[1][0])).toContain('INSERT INTO enrichment_jobs');
    expect((await EnrichmentJob.getStatus()).running).toBe(false);
  });

  it('starts nothing when no run was left behind', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await expect(EnrichmentJob.settleCutOffRun(at('2026-10-16T01:24:00Z'))).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
