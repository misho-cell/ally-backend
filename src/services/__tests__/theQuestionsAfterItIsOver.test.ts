jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueResult: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { queueResult } from '../pendingUpdates.service';
import { renderPendingMessage } from '../pendingMessages';
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

/**
 * ⚠️ AND IT FIRED, AND THE QUEUE WOULD NEVER HAVE LET IT OUT.
 *
 * The tester, 25 September 21:27 UTC, on the build that shipped this: Test 17
 * closed goal 10594 on „Resolved — a neighbour fixed the tap" at 21:25:01, the
 * goal went closed/finished at 21:25:12, and NO question appeared — not in the
 * thread, not in the updates. Goal 10495, finished at 17:54, still had none
 * three and a half hours later.
 *
 * IT READS EXACTLY LIKE „THE HOOK NEVER FIRED", which is what I built the same
 * afternoon and the first thing I suspected of myself. I read the base before
 * touching anything: BOTH CARDS ARE THERE. Queued one second after each close,
 * held, `release_at` already in the past. Due since the moment they were made
 * and due for ever.
 *
 * THE RELEASE QUERY DROPS UPDATES WHOSE GOAL IS CLOSED — rightly, for news, for
 * blocking questions, for debriefs and introductions, all of which go stale
 * when a goal ends. `goal_feedback` is the one kind a close CREATES. „What came
 * of it? Would you use it again?" cannot be asked about anything else. So it
 * was written into a queue that refused to release it for the very reason it
 * had been written.
 *
 * Not a hook, not a flag, not the six questions, not the table: a true sentence
 * about every other kind, applied to the one it is false about. The measurement
 * was right and the question was different, which is this week's whole refrain.
 *
 * ⚠️ AND `/admin/goal-feedback` READING 0 PROVED NOTHING EITHER WAY, which is
 * worth its own line because it was offered as evidence and I nearly took it:
 * that endpoint reads the ANSWERS table. Nobody can answer a question they were
 * never asked, so 0 is what it says whether the fault is here or in the asking.
 */
describe('a card queued by a close survives the close', () => {
  const updates = readFileSync(join(__dirname, '..', 'pendingUpdates.service.ts'), 'utf8');

  it('names the kinds a closed goal is the reason for, not a reason to drop', () => {
    expect(updates).toContain("const KINDS_THAT_OUTLIVE_THEIR_GOAL = ['goal_feedback'];");
  });

  /**
   * BOTH READERS, from the one constant. A card that can be shown but is not
   * counted, or counted but never shown, is the „due/held" disagreement this
   * file already carries a scar from.
   */
  it('excepts it in the release query AND in the held count', () => {
    // Prose stripped first: the paragraph above the constant QUOTES the clause
    // to explain it, and a test that counts prose counts the wrong thing.
    const sql = updates.replace(/\/\*[\s\S]*?\*\//g, '');
    const closedGoalClauses = sql.match(/t\.status <> 'closed'[^\n]*/g) ?? [];

    expect(closedGoalClauses).toHaveLength(2);
    for (const clause of closedGoalClauses) {
      expect(clause).toMatch(/OR p\.kind = ANY\(\$\d::text\[\]\)/);
    }
  });

  /** The array reaches both queries as a parameter, never spliced into the SQL. */
  it('passes the kinds as a bound parameter, never spliced into the SQL', () => {
    const sql = updates.replace(/\/\*[\s\S]*?\*\//g, '');
    const uses = sql.match(/KINDS_THAT_OUTLIVE_THEIR_GOAL/g) ?? [];

    // The declaration plus three call sites: release, count, and the row list.
    expect(uses).toHaveLength(4);
    expect(sql).not.toMatch(/\$\{KINDS_THAT_OUTLIVE_THEIR_GOAL/);
  });

  /**
   * The exception is deliberately NARROW. A debrief or a blocking question on
   * a closed goal is stale and must still be dropped — widening this to every
   * kind would bring back the stale cards of ticket 9.
   */
  it('excepts that one kind and no others', () => {
    const list = updates.slice(
      updates.indexOf('const KINDS_THAT_OUTLIVE_THEIR_GOAL'),
      updates.indexOf('const KINDS_THAT_OUTLIVE_THEIR_GOAL') + 120,
    );

    expect(list).not.toContain('debrief');
    expect(list).not.toContain('goal_question');
  });
});

/**
 * ⚠️ AND IT WAS RELEASED, MARKED SEEN, AND STILL NEVER SHOWN TO ANYBODY.
 *
 * The tester, 22:35 UTC, an hour after I reported this row fixed: „the cards
 * are released and marked SEEN but the question never reaches the person" —
 * goals 10495, 10594, 10660. Right again, and the cause was mine from four
 * hours earlier.
 *
 * I gave `goal_feedback` a table, a hook on closing, a queue, a name in the
 * „also waiting" breakdown, and — that evening — a release of its own. I never
 * gave it a case in `renderPendingMessage`, which is the one place that turns
 * a queued item into something a person can read. It fell through to
 * `default`, which returns null by design for kinds the model still narrates.
 * But the delivery note tells the model NOT to mention items that are
 * „delivered separately". So the item was consumed, marked seen, and dropped
 * between the two halves that each believed the other had it.
 *
 * The same shape as the release bug it follows, one layer further out: every
 * part correct except the one nobody asked the question of.
 *
 * ⚠️ AND THE PAYLOAD HAD NO QUESTION IN IT. Only the key and the model-facing
 * instruction, so even a renderer would have had nothing to print. The words a
 * person reads have to travel with the item; `question_key` stays as the
 * fallback for the three rows queued before they did.
 */
describe('the question actually reaches the person', () => {
  const messages = readFileSync(join(__dirname, '..', 'pendingMessages.ts'), 'utf8');

  it('has a case in the renderer, not just a name in the breakdown', () => {
    const render = messages.slice(messages.indexOf('export function renderPendingMessage'));

    expect(render).toContain("case 'goal_feedback': {");
  });

  it('shows the question and offers no answers of ours', () => {
    const card = renderPendingMessage(
      {
        kind: 'goal_feedback',
        task_id: 10594,
        payload: { question_key: 'what_came_of_it', prompt: 'რა გამოვიდა საბოლოოდ?' },
      },
      'ka',
    );

    expect(card?.text).toBe('რა გამოვიდა საბოლოოდ?');
    // The founder asked for people's own words. A set of buttons is how you
    // get somebody else's; the one button is a way out, not an answer.
    expect(card?.choices).toHaveLength(1);
    expect(card?.ref.task_id).toBe(10594);
  });

  /** The three already queued carry no prompt and must still be readable. */
  it('falls back to the key for a row queued before the prompt existed', () => {
    const card = renderPendingMessage(
      { kind: 'goal_feedback', task_id: 10495, payload: { question_key: 'what_you_wanted' } },
      'en',
    );

    expect(card?.text).toBe('What did you want to resolve with this goal?');
  });

  it('says nothing rather than something empty when it has neither', () => {
    expect(
      renderPendingMessage({ kind: 'goal_feedback', task_id: 1, payload: {} }, 'ka'),
    ).toBeNull();
    expect(
      renderPendingMessage(
        { kind: 'goal_feedback', task_id: 1, payload: { question_key: 'not_a_real_key' } },
        'ka',
      ),
    ).toBeNull();
  });

  it('sends the question with the item from now on', () => {
    const service = readFileSync(join(__dirname, '..', 'goalFeedback.service.ts'), 'utf8');
    const queue = service.slice(service.indexOf('await queueResult(userId, taskId'));

    expect(queue.slice(0, 600)).toContain('prompt: next.prompt');
  });
});

/**
 * ⚠️ „THE PROMPT IS GEORGIAN FOR AN ENGLISH-WRITING SEAT" — the tester, within
 * an hour of the card being drawn at all.
 *
 * The question is chosen when the goal CLOSES and read when the person next
 * opens a conversation. Those are two moments and they can be in two
 * languages. It did not matter while the model narrated the question, because
 * a model translates what it is handed. Now that the SERVER draws this card,
 * nothing downstream can.
 *
 * So the key decides the words and the CONVERSATION decides the language. The
 * stored `prompt` stays as the fallback for a key a later build does not know:
 * a question already asked must stay readable even if it is renamed.
 */
describe('the card speaks the language of the conversation it is in', () => {
  const card = (payload: Record<string, unknown>, language: 'ka' | 'en') =>
    renderPendingMessage({ kind: 'goal_feedback', task_id: 10693, payload }, language);

  it('reads English to an English conversation even though it was stored in Georgian', () => {
    const out = card(
      { question_key: 'what_you_wanted', prompt: 'რისი გადაჭრა გინდოდა ამ მიზნით?' },
      'en',
    );

    expect(out?.text).toBe('What did you want to resolve with this goal?');
    expect(out?.text).not.toMatch(/[Ⴀ-ჿ]/);
  });

  it('still reads Georgian to a Georgian conversation', () => {
    const out = card({ question_key: 'what_you_wanted', prompt: 'ignored' }, 'ka');

    expect(out?.text).toBe('რისი გადაჭრა გინდოდა ამ მიზნით?');
  });

  /** A key this build does not know still has words, because it was stored. */
  it('falls back to the stored words for a key it does not recognise', () => {
    const out = card({ question_key: 'renamed_later', prompt: 'Whatever was asked' }, 'en');

    expect(out?.text).toBe('Whatever was asked');
  });
});
