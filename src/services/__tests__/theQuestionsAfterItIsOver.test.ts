jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueResult: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { queueResult } from '../pendingUpdates.service';
import {
  GOAL_FEEDBACK_QUESTIONS,
  nextFeedbackQuestion,
  recordGoalFeedback,
  queueGoalFeedback,
  feedbackWording,
} from '../goalFeedback.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueue = queueResult as jest.MockedFunction<typeof queueResult>;

/**
 * ROW 272 — SHORT FEEDBACK QUESTIONS AFTER A GOAL IS CLOSED.
 *
 * The founder's vision document asks for them. The tester confirmed on
 * 25 September that nothing fired: goal 10429 closed on „Resolved" at 15:51
 * and no question followed, and usage.feedback_answers reads 0 — the truth,
 * not a reporting gap.
 *
 * ⚠️ TWO THINGS I ALMOST GOT WRONG, both found by reading the database rather
 * than the names of things.
 *
 * FIRST, the question bank is the wrong home. All 43 rows there carry
 * `options` and a `select_mode` of single or multi — it is a MULTIPLE-CHOICE
 * bank, and these six are open questions. Putting them there would have meant
 * inventing options nobody asked for.
 *
 * SECOND, and worse, I had written `goal_bound: true` on them. It reads
 * exactly right. It means „asked only while a goal is OPEN". These are asked
 * when one CLOSES — the flag would have made them never fire, and the
 * configuration would have looked perfectly correct.
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('the six questions', () => {
  it('are the founder’s six, in his order', () => {
    expect(GOAL_FEEDBACK_QUESTIONS).toEqual([
      'what_you_wanted',
      'what_netai_did',
      'what_came_of_it',
      'where_you_stepped_in',
      'again_and_pay',
      'who_would_you_tell',
    ]);
  });

  /**
   * A language with no wording would be a question that silently does not
   * exist for that person — the founder's own ruling about the question bank,
   * and it applies here for the same reason.
   */
  it('exist in every language the product speaks', () => {
    for (const lang of ['ka', 'en', 'ru', 'es'] as const) {
      for (const key of GOAL_FEEDBACK_QUESTIONS) {
        expect(feedbackWording(key, lang).trim().length).toBeGreaterThan(5);
      }
    }
  });

  it('asks the first unanswered one, not the first one', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ question_key: 'what_you_wanted' }, { question_key: 'what_netai_did' }],
      rowCount: 2,
    } as never);

    const next = await nextFeedbackQuestion(1, 'ka');

    expect(next?.key).toBe('what_came_of_it');
  });

  it('stops when all six are answered', async () => {
    mockQuery.mockResolvedValue({
      rows: GOAL_FEEDBACK_QUESTIONS.map((question_key) => ({ question_key })),
      rowCount: 6,
    } as never);

    expect(await nextFeedbackQuestion(1, 'ka')).toBeNull();
  });
});

describe('one question at a time', () => {
  /**
   * A person who has just finished something will answer one question and
   * close six. The next is queued only when this one is answered — and if they
   * never answer, the rest are never asked, which is the right outcome and not
   * a gap.
   */
  it('queues exactly one item', async () => {
    await queueGoalFeedback('7', 42);

    expect(mockQueue).toHaveBeenCalledTimes(1);
    expect(mockQueue).toHaveBeenCalledWith(
      '7',
      42,
      'goal_feedback',
      expect.objectContaining({ question_key: 'what_you_wanted' }),
    );
  });

  it('does not queue a second one while the first is still waiting', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 9 }], rowCount: 1 } as never);

    await queueGoalFeedback('7', 42);

    expect(mockQueue).not.toHaveBeenCalled();
  });

  /** The instruction rides with the item, as every other kind's does. */
  it('tells the model this is feedback and not more work on the goal', async () => {
    await queueGoalFeedback('7', 42);
    const payload = mockQueue.mock.calls[0][3] as { instruction: string };

    expect(payload.instruction).toContain('do not search');
    expect(payload.instruction).toContain('do not write to anybody');
    expect(payload.instruction).toContain('save_goal_feedback');
  });
});

describe('their own words, or nothing', () => {
  it('refuses an empty answer rather than storing a blank', async () => {
    expect(await recordGoalFeedback(1, '7', 'what_netai_did', '   ')).toBe('empty');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('stores it verbatim and corrects rather than duplicating', async () => {
    await recordGoalFeedback(1, '7', 'what_netai_did', '  მიპოვა ელექტრიკოსი  ');
    const [sql, params] = mockQuery.mock.calls[0];

    expect(String(sql)).toContain('ON CONFLICT (task_id, question_key)');
    expect(params).toContain('მიპოვა ელექტრიკოსი');
  });

  /**
   * Not normalised, not scored, not tagged. The founder asked what people
   * would SAY; a tag vector answers a question he did not ask and the words
   * cannot be got back out of it.
   */
  /**
   * ⚠️ The first version of this test matched the words „summar" anywhere in
   * the file — and failed on my OWN COMMENT saying „do not summarise". It was
   * reading prose and calling it code. This reads what the function does.
   */
  it('does not summarise or score anything', () => {
    const src = readFileSync(join(__dirname, '..', 'goalFeedback.service.ts'), 'utf8');
    const imports = src.slice(0, src.indexOf('export const'));
    const fn = src.slice(src.indexOf('export async function recordGoalFeedback'));

    // Nothing that could rewrite an answer is even in scope.
    expect(imports).not.toMatch(/normaliz|score|classif|summari/i);
    // And what is stored is the text itself, bounded, and nothing derived.
    expect(fn.slice(0, 900)).toContain('text.slice(0, 2000)');
    expect(fn.slice(0, 900)).not.toMatch(/normalized_tags|score_vector/);
  });
});

describe('when it fires, and when it deliberately does not', () => {
  const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');

  /**
   * ⚠️ ONLY a finished goal. „What came of it?", „would you use it again and
   * pay?" asked about a goal somebody ABANDONED is worse than not asking — it
   * reads as the software not having noticed. `stopped` is the majority of
   * closes and it gets nothing.
   */
  it('asks only after a goal the owner actually finished', () => {
    expect(store).toContain("status === 'closed' && closedAs === 'finished'");
  });

  it('cannot stop a goal from closing', () => {
    const hook = store.slice(store.indexOf('void queueGoalFeedback('));

    expect(hook.slice(0, 400)).toContain('catch');
  });
});
