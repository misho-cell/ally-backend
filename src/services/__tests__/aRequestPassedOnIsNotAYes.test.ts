jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { passedOnAnswer, requestPassedOnTo } from '../introduction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Lika's manual test (6 Nov): „მე ვერ ვიზამ, მაგრამ გიორგი დაგაკავშირებს" —
 * the request went on to Giorgi, then a yes was recorded too, and the owner
 * read „Tornike agreed". A go-between who passed it on gave no yes of their own.
 */
describe('a request the go-between passed on', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is found, with whom it went to', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'გიორგი' }] } as never);
    expect(await requestPassedOnTo('7', 11)).toBe('გიორგი');
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('forwarded_by_user_id');
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await requestPassedOnTo('7', 11)).toBeNull();
  });

  it('is answered as passed on, not as a yes', () => {
    expect(passedOnAnswer('გიორგი')).toBe('თვითონ ვერ დაგაკავშირებ — თხოვნა გიორგის გადავეცი.');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'return respondToIntroduction(userId, requestId, false, passedOnAnswer(passedTo));',
    );
  });

  it('reads as not passed on when that cannot be read', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await requestPassedOnTo('7', 11)).toBeNull();
  });
});
