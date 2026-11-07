const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { holdAsk } from '../heldAsks.service';
import { keepHeldAsk } from '../paceUntilSeen';
import { HELD_QUESTION_SEPARATOR, MAX_QUESTION_CHARS } from '../heldQuestionJoin';

beforeEach(() => jest.resetAllMocks());

const TASK = 501;
const HELPER = 77;
const SECOND = 'იცნობ ნიკას, ხელოსანს?';

function call(n: number): [string, unknown[], number] {
  return mockQuery.mock.calls[n] as [string, unknown[], number];
}

/**
 * Giorgi's review, case 3: a go-between got Dato, Nika and Dato G. each in a
 * message of its own, and a second held question to the same person was lost.
 */
describe('a question held for an unseen message (#7659)', () => {
  it('joins the one already waiting for the same person and goal', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await keepHeldAsk(TASK, '9', HELPER, 'p1', SECOND);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params, timeout] = call(0);
    expect(sql).toContain('UPDATE pace_held_asks SET question = question || $3::text || $4::text');
    expect(sql).toContain('task_id = $1 AND to_user_id = $2 AND released_at IS NULL');
    // A question already in the waiting text is not added twice; the join must fit one ask.
    expect(sql).toContain('strpos(question, $4::text) = 0');
    expect(sql).toContain('<= $5::int');
    expect(params).toEqual([TASK, HELPER, HELD_QUESTION_SEPARATOR, SECOND, MAX_QUESTION_CHARS]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('gets a row of its own when nothing can take it, unless the same text already waits', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await keepHeldAsk(TASK, '9', HELPER, 'p1', SECOND);
    const [sql, params] = call(1);
    expect(sql).toContain('INSERT INTO pace_held_asks');
    expect(sql).toContain('strpos(question, $5::text) > 0');
    expect(params).toEqual([TASK, '9', HELPER, 'p1', SECOND]);
  });
});

describe('a question held by the 24-hour limit (#391)', () => {
  const input = {
    taskId: TASK,
    toUserId: HELPER,
    contactName: 'ლევანი',
    contactPhone: 'p1',
    question: SECOND,
    reopensAt: new Date('2026-11-08T09:00:00Z'),
  };

  it('joins the one held for the same person and the same send', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await holdAsk({ ...input, eveningCardId: 12 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = call(0);
    expect(sql).toContain('UPDATE held_asks SET question = question || $4::text || $5::text');
    // An evening card's question joins only that card's, a wake's only a wake's.
    expect(sql).toContain('evening_card_id IS NOT DISTINCT FROM $3::bigint');
    expect(sql).toContain('strpos(question, $5::text) = 0');
    expect(params).toEqual([TASK, HELPER, 12, HELD_QUESTION_SEPARATOR, SECOND, MAX_QUESTION_CHARS]);
  });

  it('is held on its own when it cannot join', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await holdAsk(input);
    expect(call(0)[1]).toEqual([
      TASK,
      HELPER,
      null,
      HELD_QUESTION_SEPARATOR,
      SECOND,
      MAX_QUESTION_CHARS,
    ]);
    const [sql] = call(1);
    expect(sql).toContain('INSERT INTO held_asks');
    expect(sql).toContain('strpos(question, $5::text) > 0');
  });
});
