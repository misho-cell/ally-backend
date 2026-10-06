jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));

import { query } from '../../db/postgres/client';
import { goalAlreadySearchedAndAnswered } from '../taskEngine.service';

/**
 * #2116 (tester 43066, conv 41586): the only reply after the opening searches
 * was „ვეძებ…" — an announcement. The plan turn was told the owner had read
 * the findings, wrote nothing, and the goal went silent.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

function replies(contents: string[]): Awaited<ReturnType<typeof query>> {
  return { rows: contents.map((content) => ({ content })) } as unknown as Awaited<
    ReturnType<typeof query>
  >;
}

beforeEach(() => mockQuery.mockReset());

describe('a goal whose findings are on the screen', () => {
  it('is not one when the only reply says it is searching', async () => {
    mockQuery.mockResolvedValueOnce(
      replies(['ვეძებ შენს კონტაქტებში და ქსელში ბათუმის სასტუმროს მენეჯერებს.']),
    );
    await expect(goalAlreadySearchedAndAnswered(19820)).resolves.toBe(false);
  });

  it('is one when a reply after the search carries what was found', async () => {
    mockQuery.mockResolvedValueOnce(
      replies([
        'ვეძებ კიდევ…',
        'შენს კონტაქტებში ბათუმში ორი სასტუმროს მენეჯერია: ნინო და გიორგი. მეორე წრეში კიდევ ერთი.',
      ]),
    );
    await expect(goalAlreadySearchedAndAnswered(19820)).resolves.toBe(true);
  });

  it('is not one when nothing was answered after the search', async () => {
    mockQuery.mockResolvedValueOnce(replies([]));
    await expect(goalAlreadySearchedAndAnswered(19820)).resolves.toBe(false);
  });

  it('reads a bounded number of replies, with a timeout', async () => {
    mockQuery.mockResolvedValueOnce(replies([]));
    await goalAlreadySearchedAndAnswered(19820);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('LIMIT $3');
    expect((params as unknown[])[0]).toBe(19820);
    expect(timeout).toBeGreaterThan(0);
  });
});
