jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { query } from '../../db/postgres/client';
import { listUnwokenAnswersForTask, markAskWakeDelivered } from '../taskAsks.service';
import { unheardAnswerOf } from '../answerAddition';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

/**
 * #7195 / #7459 (tester 75439, asker threads 65287/65288/65289, 3/3): the
 * helper's second line came while the first answer's wake was still running.
 * No delivered stamp existed yet, so nothing recorded what the asker had
 * heard, and the next card and wake carried the first answer again — the
 * asker's assistant said „the same answer, nothing new".
 */
const FIRST = 'ბესო ელექტრიკოსს იცნობს, კარგი ხელოსანია.';
const ADDED = 'ბესო ორშაბათამდე დაკავებულია, ორშაბათის მერე კი შეძლებს.';

describe('an answer that grew while its wake ran', () => {
  it('keeps the answer the run delivered as heard', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ delivered: false }], rowCount: 1 } as never);
    await expect(markAskWakeDelivered(28418, FIRST)).resolves.toBe(false);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      'delivered_answer = CASE WHEN $2::text IS NOT NULL AND answer <> $2 THEN $2',
    );
    expect(params).toEqual([28418, FIRST]);
  });

  it('then carries only the added line', () => {
    expect(unheardAnswerOf({ answer: `${FIRST}\n${ADDED}`, delivered_answer: FIRST })).toBe(ADDED);
  });

  it('leaves what was heard alone when the answer did not change', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ delivered: true }], rowCount: 1 } as never);
    await expect(markAskWakeDelivered(28418, FIRST)).resolves.toBe(true);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ELSE delivered_answer END');
  });

  it('is read by the delivery that runs at once, not only by the sweep', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await listUnwokenAnswersForTask(31849, 10);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ta.delivered_answer');
  });
});
