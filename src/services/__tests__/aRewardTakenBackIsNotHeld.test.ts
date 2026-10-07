jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  __esModule: true,
}));

import { query } from '../../db/postgres/client';
import { clearPriceCache } from '../costLedger.service';
import { getReferralSummary, heldUntil } from '../referral.service';

/**
 * The tester's 2180 (box 44123): after the undo of a first payment each
 * inviter read balance 0, „on hold 0.50, available -0.50" — the earn line still
 * counted as held, though its own take-back line stood beside it.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const CREATED = new Date('2026-10-07T07:20:00Z');
const INSIDE_THE_WINDOW = new Date('2026-10-08T00:00:00Z');

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

describe('a reward taken back inside the refund window', () => {
  beforeEach(() => {
    clearPriceCache();
    mockQuery.mockReset();
  });

  it('has no date it becomes usable', () => {
    expect(heldUntil('earn', CREATED, INSIDE_THE_WINDOW, true)).toBeNull();
    expect(heldUntil('earn', CREATED, INSIDE_THE_WINDOW)).not.toBeNull();
  });

  it('is not counted as held, so nothing reads as negative', async () => {
    const sqls: string[] = [];
    mockQuery.mockImplementation(((sql: string) => {
      sqls.push(sql);
      if (sql.includes('FROM provider_prices')) return Promise.resolve(rows([{ value: '10' }]));
      if (sql.includes('FILTER (WHERE amount_usd > 0)')) {
        return Promise.resolve(rows([{ balance: '0.00', earned: '0.50', on_hold: null }]));
      }
      return Promise.resolve(
        rows([
          {
            amount_usd: '-0.50',
            reason: 'clawback',
            level: 1,
            created_at: CREATED,
            taken_back: false,
          },
          { amount_usd: '0.50', reason: 'earn', level: 1, created_at: CREATED, taken_back: true },
        ]),
      );
    }) as never);

    const summary = await getReferralSummary('178151');

    expect(summary.onHoldUsd).toBe(0);
    expect(summary.availableUsd).toBe(0);
    expect(summary.history.every((line) => line.availableFrom === undefined)).toBe(true);
    const totals = sqls.find((sql) => sql.includes('AS on_hold')) ?? '';
    expect(totals).toContain(
      "taken.external_id = 'clawback_' || referral_transactions.external_id",
    );
    expect(totals).toContain('AND NOT EXISTS');
  });
});
