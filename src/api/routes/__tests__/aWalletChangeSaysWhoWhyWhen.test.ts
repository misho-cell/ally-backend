jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../../db/postgres/client';
import {
  adjustingAdmin,
  adminAdjustmentHistory,
  adminAdjustmentId,
  MAX_ADJUSTMENT_HISTORY,
} from '../../../services/tokenWallet.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const UUID = '0b7c6a1e-2f4d-4c1a-9d3e-5a6b7c8d9e0f';

/** #6106 (the founder's ask; Misho's yes 20 Oct): who, why and when, for every wallet change. */
describe('an admin wallet change says who, why and when', () => {
  beforeEach(() => mockQuery.mockReset());

  it('keeps the admin in the row’s external id, and reads older rows as unnamed', () => {
    expect(adminAdjustmentId('167250', UUID)).toBe(`admin:167250:${UUID}`);
    expect(adjustingAdmin(`admin:167250:${UUID}`)).toBe('167250');
    expect(adjustingAdmin(`admin:${UUID}`)).toBeNull();
    expect(adjustingAdmin('topup:pi_123')).toBeNull();
    expect(adjustingAdmin(null)).toBeNull();
  });

  it('lists the adjustments newest first, with the reason and the admin', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          created_at: new Date('2026-10-20T07:00:00Z'),
          amount: -50,
          note: 'correction',
          external_id: `admin:167250:${UUID}`,
        },
        {
          created_at: new Date('2026-10-20T06:55:00Z'),
          amount: 100,
          note: 'launch guest',
          external_id: `admin:${UUID}`,
        },
      ],
    } as never);
    expect(await adminAdjustmentHistory('189001', 500)).toEqual([
      { at: '2026-10-20T07:00:00.000Z', tokens: -50, reason: 'correction', by_admin: '167250' },
      { at: '2026-10-20T06:55:00.000Z', tokens: 100, reason: 'launch guest', by_admin: null },
    ]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('ORDER BY created_at DESC');
    expect(params?.[2]).toBe(MAX_ADJUSTMENT_HISTORY);
  });

  it('accepts the board’s field names on both wallet routes, and serves the history', () => {
    const routes = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
    expect(routes).toContain("fields['tokens'] = fields['amount']");
    expect(routes).toContain("fields['note'] = fields['reason']");
    expect(routes.match(/tokenFieldAliases,\n/g)).toHaveLength(2);
    expect(routes).toContain("'/users/:id/tokens/history'");
  });
});
