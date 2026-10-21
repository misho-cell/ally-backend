jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../costLedger.service', () => ({ __esModule: true, clearPriceCache: jest.fn() }));

import { query } from '../../db/postgres/client';
import { clearPriceCache } from '../costLedger.service';
import { readTrialGrant, TRIAL_GRANT_PRICE_KEY, writeTrialGrant } from '../trialGrant.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const STAMP = '2026-10-21T12:00:00.000Z';
const rows = (data: unknown[]): never => ({ rows: data, rowCount: data.length }) as never;

beforeEach(() => jest.clearAllMocks());

describe('readTrialGrant', () => {
  it('reads the trial grant by its price key, with a timeout', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ value: '2000.00000000', updated_at: STAMP }]));

    await expect(readTrialGrant()).resolves.toEqual({ value: 2000, updated_at: STAMP });
    const [, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(params).toEqual([TRIAL_GRANT_PRICE_KEY]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('answers zero when the row was never written — the wallet then grants nothing', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    await expect(readTrialGrant()).resolves.toEqual({ value: 0, updated_at: null });
  });

  it('lets a database error reach the caller', async () => {
    mockQuery.mockRejectedValueOnce(new Error('down'));

    await expect(readTrialGrant()).rejects.toThrow('down');
  });
});

describe('writeTrialGrant', () => {
  it('upserts the number and drops the price cache so it is credited at once', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ value: '2500.00000000', updated_at: STAMP }]));

    await expect(writeTrialGrant(2500)).resolves.toEqual({ value: 2500, updated_at: STAMP });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (price_key) DO UPDATE');
    expect(params).toEqual([TRIAL_GRANT_PRICE_KEY, 2500]);
    expect(clearPriceCache).toHaveBeenCalledTimes(1);
  });

  it('leaves the cache alone when the write fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('down'));

    await expect(writeTrialGrant(2500)).rejects.toThrow('down');
    expect(clearPriceCache).not.toHaveBeenCalled();
  });
});
