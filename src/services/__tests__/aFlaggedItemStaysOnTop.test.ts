jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  countFollowedUpdates,
  listFollowedUpdates,
  setThreadFollowed,
  setUpdateFollowed,
} from '../followUp.service';

/**
 * #2080 (the founder, D703): a one-tap flag keeps an update card or a
 * დავალება row in front of its owner until a second tap clears it.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

function rows<T>(r: T[], rowCount = r.length): Awaited<ReturnType<typeof query>> {
  return { rows: r, rowCount } as unknown as Awaited<ReturnType<typeof query>>;
}

beforeEach(() => mockQuery.mockReset());

describe('a conversation row', () => {
  it('is flagged for its owner only, with a timeout', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ followed: true }]));
    await expect(setThreadFollowed(41, '171', true)).resolves.toBe(true);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE id = $1 AND user_id = $2');
    expect(params).toEqual([41, '171', true]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('keeps the first flag time when tapped twice, and clears on the second tap', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ followed: false }]));
    await expect(setThreadFollowed(41, '171', false)).resolves.toBe(false);
    expect(mockQuery.mock.calls[0][0]).toContain(
      'CASE WHEN $3 THEN COALESCE(followed_at, NOW()) ELSE NULL END',
    );
  });

  it('is not found when it is somebody else’s', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await expect(setThreadFollowed(41, '999', true)).resolves.toBeNull();
  });

  it('rides at the top of the list, above the open goals', () => {
    const src = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    expect(src).toContain('t.followed_at IS NOT NULL AS followed');
    expect(src).toContain('(${HAS_OPEN_GOAL} OR t.followed_at IS NOT NULL)');
    expect(src.match(/ORDER BY \(t\.followed_at IS NOT NULL\) DESC/g) ?? []).toHaveLength(2);
  });
});

describe('an update card', () => {
  it('is flagged for its owner only', async () => {
    mockQuery.mockResolvedValueOnce(rows([], 1));
    await expect(setUpdateFollowed('171', 9, true)).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual([9, '171', true]);
  });

  it('is not found when it is somebody else’s', async () => {
    mockQuery.mockResolvedValueOnce(rows([], 0));
    await expect(setUpdateFollowed('999', 9, false)).resolves.toBe(false);
  });

  it('is listed and counted from the same rows: shown once, and flagged', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 9, task_id: null, kind: 'k', payload: {} }]));
    mockQuery.mockResolvedValueOnce(rows([{ n: 1 }]));
    await expect(listFollowedUpdates('171')).resolves.toHaveLength(1);
    await expect(countFollowedUpdates('171')).resolves.toBe(1);
    const condition = "p.user_id = $1 AND p.status = 'seen' AND p.followed_at IS NOT NULL";
    expect(mockQuery.mock.calls[0][0]).toContain(condition);
    expect(mockQuery.mock.calls[1][0]).toContain(condition);
    expect(mockQuery.mock.calls[0][0]).toContain('LIMIT $2');
  });

  it('D716: a flagged conversation counts in the same one number', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ n: 3 }]));
    await expect(countFollowedUpdates('171')).resolves.toBe(3);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('FROM threads t');
    expect(sql).toContain('t.user_id = $2::int AND t.followed_at IS NOT NULL');
    expect(mockQuery.mock.calls[0][1]).toEqual(['171', '171']);
  });
});
