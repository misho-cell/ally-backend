jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { blockedListForScreen, unblockByRef } from '../block.service';

/**
 * Board #505 (Ninia): no list of blocked people in the app, no way to unblock.
 * The list the screen draws never carries a phone number, and an unblock can
 * only ever touch the asking owner's own row.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

describe('blockedListForScreen', () => {
  it('returns a reference, a name and a date, and no phone', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ref: 7, name: 'ნინო', blocked_at: '2026-10-03T05:00:00.000Z' }],
      rowCount: 1,
    } as never);

    const rows = await blockedListForScreen('174300');

    expect(rows).toEqual([{ ref: 7, name: 'ნინო', blocked_at: '2026-10-03T05:00:00.000Z' }]);
    expect(Object.keys(rows[0])).not.toContain('phone');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE ub."blockerId" = $1::int');
    expect(sql).not.toMatch(/AS phone|"blockedPhone"\s+AS/);
    expect(params[0]).toBe('174300');
  });

  it('keeps a person with no saved name, with a null name', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ ref: 9, name: null, blocked_at: new Date('2026-10-01T10:00:00Z') }],
      rowCount: 1,
    } as never);

    expect(await blockedListForScreen('174300')).toEqual([
      { ref: 9, name: null, blocked_at: '2026-10-01T10:00:00.000Z' },
    ]);
  });
});

describe('unblockByRef', () => {
  it('deletes only the asking owner’s row', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    expect(await unblockByRef('174300', 7)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE id = $1 AND "blockerId" = $2::int');
    expect(params).toEqual([7, '174300']);
  });

  it('says so when there was no such row for this owner', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect(await unblockByRef('174300', 99)).toBe(false);
  });
});

describe('the routes', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'profile.routes.ts'),
    'utf8',
  );

  it('serves the list and the unblock behind the owner’s login', () => {
    const list = routes.slice(routes.indexOf("'/blocked',"));
    expect(list.slice(0, 200)).toContain('authenticateJwt');
    const remove = routes.slice(routes.indexOf("'/blocked/:ref',"));
    expect(remove.slice(0, 300)).toContain('authenticateJwt');
    expect(remove.slice(0, 300)).toContain("param('ref').isInt({ min: 1 })");
    expect(remove.slice(0, 300)).toContain('rateLimit(');
  });

  it('answers 404, not 200, when the row is not the owner’s', () => {
    const remove = routes.slice(routes.indexOf("'/blocked/:ref',"));
    expect(remove.slice(0, 1200)).toContain('res.status(404)');
  });
});
