import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ ROW 250.1 — A CARD ABOUT GOAL A WAS APPEARING INSIDE GOAL B.
 *
 * The founder, 25 September: „a reminder card appears only on the main
 * updates list and inside ITS OWN goal's conversation. Never inside another
 * goal's conversation, and never in a finished one." His example: opening a
 * CLOSED lawyer goal and finding a painters-plan reminder in it.
 *
 * ⚠️ IT WAS HANDED TO THE APP TEAM AND IT WAS OURS. The client was drawing
 * exactly what we stored: `deliverPendingMessages` wrote every card into the
 * thread THE RUN HAPPENED IN, whatever goal the item belonged to. A reminder
 * released while somebody was chatting elsewhere landed wherever they were.
 *
 * MEASURED over fourteen days before changing anything:
 *
 *   176  cards delivered that name a goal
 *   158  LANDED IN ANOTHER GOAL'S THREAD
 *    25  of those in a goal that is CLOSED
 *    12  people
 *
 * The closed lawyer goal with a painters reminder in it is 25 rows, not an
 * anecdote. I sent the tester a message stopping the app team before writing
 * a line of the fix, because an evening spent hunting a frontend bug that is
 * not there is the expensive half of a misrouted row.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const goalQuestions = readFileSync(join(__dirname, '..', 'goalQuestions.service.ts'), 'utf8');

const fn = chat.slice(
  chat.indexOf('async function threadForPendingItem'),
  chat.indexOf('async function deliverPendingMessages'),
);

describe('a card goes to the goal it is about', () => {
  it('reads that goal’s own thread', () => {
    expect(fn).toContain('SELECT thread_id FROM tasks WHERE id = $1');
  });

  it('delivers the card, its event and its live update to the same place', () => {
    const deliver = chat.slice(
      chat.indexOf('async function deliverPendingMessages'),
      chat.indexOf('async function savePendingMessage'),
    );

    expect(deliver).toContain('const target = await threadForPendingItem(item, threadId);');
    // All three writes follow the item, not the run.
    expect(deliver.match(/\btarget\b/g)?.length).toBeGreaterThanOrEqual(4);
    expect(deliver).not.toContain('emitMessageAppended(userId, threadId, runId');
  });
});

describe('what deliberately still goes to the current thread', () => {
  /**
   * An introduction, a chorus ask, a thanks-loop name a PERSON and not a
   * goal. They have no thread of their own, and the ruling is about goals.
   */
  it('leaves an item with no goal where it is', () => {
    expect(fn).toContain('if (item.task_id === null) return fallbackThreadId;');
  });

  /**
   * A goal with no thread of its own has nowhere better to go. Dropping the
   * card would be worse than the wrong room: a reminder nobody sees is worse
   * than one in the wrong place.
   */
  it('falls back rather than dropping a card', () => {
    expect(fn).toContain('own.rows[0]?.thread_id ?? fallbackThreadId');
    expect(fn).toContain('catch (error)');
  });
});

/**
 * ⚠️ AND IT COLLIDED WITH SOMETHING I SHIPPED TWO HOURS EARLIER.
 *
 * The goal-question instruction said the card was coming „right after your
 * reply". Once the card goes to the GOAL's own thread, that sentence is false
 * whenever the person is reading a different one — the reply would promise a
 * card they cannot see from where they are.
 */
describe('the reply does not promise a card the reader cannot see', () => {
  it('names the goal’s own conversation as where the card is', () => {
    expect(goalQuestions).toContain('IN THAT GOAL');
    expect(goalQuestions).toContain('CONVERSATION');
  });

  it('tells it what to say when this is NOT that goal’s thread', () => {
    expect(goalQuestions).toContain('do not promise a card they ');
  });

  it('still forbids restating the question', () => {
    expect(goalQuestions).toContain('DO NOT ASK IT AGAIN');
  });
});
