jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { listSeenUpdates, SEEN_SCREEN_LIMIT, updateDatesFor } from '../pendingUpdates.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const OWNER = '171';

beforeEach(() => mockQuery.mockReset());

/**
 * #6369 (Giorgi, reopened 20 Oct; tester 18:54Z): /updates was not newest
 * first and showed no dates, because the screen sorts and dates its cards by
 * `created_at` and no card carried one; and older updates were missing.
 */
describe('each card on the updates page says when it was made', () => {
  it('reads the owner’s own rows once, bounded, with a timeout', async () => {
    const made = new Date('2026-10-20T14:52:00Z');
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 7, created_at: made }], rowCount: 1 } as never);
    await expect(updateDatesFor(OWNER, [7, 7, 8])).resolves.toEqual(
      new Map([[7, '2026-10-20T14:52:00.000Z']]),
    );
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('user_id = $2');
    expect(String(sql)).toContain('LIMIT $3');
    expect(params).toEqual([[7, 8], OWNER, 2]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('asks nothing for an empty screen', async () => {
    await expect(updateDatesFor(OWNER, [])).resolves.toEqual(new Map());
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is on every card the screen draws, and a failed read leaves the cards', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'updates.routes.ts'),
      'utf8',
    );
    expect(route).toContain('created_at: dates.get(u.id) ?? null');
    expect(route).toContain('[updates] dates read failed');
    expect(route.match(/datesOf\(/g) ?? []).toHaveLength(3);
  });
});

describe('the updates page holds every shown update, not the newest fifty', () => {
  it('lets the screen ask for up to the screen limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await listSeenUpdates(OWNER, SEEN_SCREEN_LIMIT);
    expect(mockQuery.mock.calls[0][1]).toEqual([OWNER, SEEN_SCREEN_LIMIT]);
  });

  it('keeps the assistant’s own read at fifty', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await listSeenUpdates(OWNER);
    expect(mockQuery.mock.calls[0][1]).toEqual([OWNER, 50]);
  });

  it('never reads past the screen limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await listSeenUpdates(OWNER, 10_000);
    expect(mockQuery.mock.calls[0][1]).toEqual([OWNER, SEEN_SCREEN_LIMIT]);
  });
});
