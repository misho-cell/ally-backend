jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  NO_CONFIRMED_TIE_REASON,
  countUnconfirmedPendingAsks,
  restoreWithdrawnAsks,
  withdrawUnconfirmedPendingAsks,
} from '../unconfirmedChorusAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

/** §90 — H: pending asks D544 holds for good are closed as „no confirmed tie". */
describe('closing the pending asks without a confirmed tie', () => {
  it('previews the count, choosing only pending asks without a confirmed tie', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ asks: 68, on_open_campaigns: 48, campaigns: 53 }],
    } as never);
    expect(await countUnconfirmedPendingAsks()).toEqual({
      asks: 68,
      on_open_campaigns: 48,
      campaigns: 53,
    });
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('p.state = $1');
    expect(String(sql)).toContain('AND NOT (');
    expect(String(sql)).toContain('human_relationship_tiers');
    expect(String(sql)).not.toContain('target_phone AS');
    expect(params).toEqual(['pending']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('withdraws them with the reason kept on the row, and names only ids', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 9 }, { id: 3 }] } as never);
    expect(await withdrawUnconfirmedPendingAsks()).toEqual({
      changed: 2,
      participant_ids: [3, 9],
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('SET state = $2, closed_reason = $3');
    expect(String(sql)).toContain('AND NOT (');
    expect(params).toEqual(['pending', 'withdrawn', NO_CONFIRMED_TIE_REASON]);
  });

  it('undoes exactly the asks closed for that reason', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] } as never);
    expect(await restoreWithdrawnAsks()).toEqual({ changed: 1, participant_ids: [3] });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('WHERE state = $2 AND closed_reason = $3');
    expect(params).toEqual(['pending', 'withdrawn', NO_CONFIRMED_TIE_REASON]);
  });

  it('reports nothing when nothing is held', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await countUnconfirmedPendingAsks()).toEqual({
      asks: 0,
      on_open_campaigns: 0,
      campaigns: 0,
    });
  });

  it('is a state the schema allows and the scheduler never sends', () => {
    const migration = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '206_participant_withdrawn.sql'),
      'utf8',
    );
    expect(migration).toContain("'withdrawn'");
    expect(migration).toContain('closed_reason TEXT');
    const chorus = readFileSync(join(__dirname, '..', 'chorusCampaign.service.ts'), 'utf8');
    expect(chorus).toContain("WHERE p.state = 'pending' AND p.scheduled_ask_at <= NOW()");
  });

  it('is reached through one validated admin route, and the campaign list explains it', () => {
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const route = admin.slice(admin.indexOf("adminRouter.patch(\n  '/chorus/unconfirmed-asks'"));
    expect(route.slice(0, 600)).toContain("body('withdrawn').isBoolean()");
    expect(admin).toContain("adminRouter.get('/chorus/unconfirmed-asks'");
    expect(admin).toContain("FILTER (WHERE p.state <> 'withdrawn') = 0");
  });
});
