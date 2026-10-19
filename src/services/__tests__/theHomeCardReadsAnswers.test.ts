jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { latestAnswers } from '../latestAnswers.service';

/**
 * The tester's 19:38Z (URGENT): GET /updates/latest answered 500 for every
 * caller after 88e80c9f (#6344) — „operator does not exist: text = integer".
 * tasks.user_id is TEXT and task_asks.from_user_id is INTEGER.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('the home card reads the answers to the owner’s questions', () => {
  it('compares the goal’s owner as text, the way the column is stored', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await latestAnswers('189294', 3);

    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain('t.user_id = a.from_user_id::text');
    expect(sql).not.toMatch(/t\.user_id = a\.from_user_id(?!::text)/);
    expect(params).toEqual(['189294', 14, 3]);
    expect(typeof timeout).toBe('number');
  });
});
