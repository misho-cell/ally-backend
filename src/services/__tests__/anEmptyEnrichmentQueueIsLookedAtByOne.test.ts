jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  backgroundQuery: jest.fn(),
  query: jest.fn(),
}));

import { backgroundQuery } from '../../db/postgres/client';
import {
  ENRICHMENT_CONCURRENCY,
  fillEnrichmentWorkers,
  queueEnrichmentJob,
} from '../enrichmentQueue';

const mockQuery = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Ops, 16 Oct 01:05Z: four claims at a time waited 11.8 s for the background
 * pool's two connections while the nightly run held them, with nothing queued.
 */
describe('an empty enrichment queue', () => {
  it('is looked at by one worker until a contact is queued', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(fillEnrichmentWorkers(jest.fn())).toBe(ENRICHMENT_CONCURRENCY);
    await settle();
    expect(fillEnrichmentWorkers(jest.fn())).toBe(1);
    await settle();
    await queueEnrichmentJob({
      userId: 501,
      userCompositeKey: 'k',
      contactPhone: '+995555000001',
      alias: 'ნინო',
      enrich: true,
    });
    expect(fillEnrichmentWorkers(jest.fn())).toBe(ENRICHMENT_CONCURRENCY);
  });
});
