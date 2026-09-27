import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ THE OWNERSHIP CHECK ON CLOSING A GOAL, WHICH NOTHING HELD.
 *
 * Block-mode sabotage, 27 September, `chat.service.ts`:
 *
 *     if (closing && (toStop === null || String(toStop.user_id) !== userId)) {
 *
 * falsified, and 4,968 tests stayed green. What it stops is the model closing
 * a goal that is not the owner's — a wrong task id, a number from an earlier
 * turn, an id it read in a search result.
 *
 * ⚠️ AND THE LAYER BELOW ONLY HOLDS HALF OF IT, which is why this one is not a
 * „worse error message" but a hole. Following the value down, as this
 * project's sweep now tells you to:
 *
 *   updateTask       `WHERE id = $1 AND user_id = $2` — SCOPED. Another
 *                    person's row is not closed. This half is safe.
 *   markThreadStopped(task.thread_id)   not scoped, and it is the FIRST thing
 *                    `stopGoal` does — deliberately, so a live run learns it
 *                    has been stopped before anything else takes a turn. On a
 *                    stranger's task that interrupts a stranger's live run.
 *   cancelAsksForTask(taskId)           not scoped: `WHERE task_id = $1 AND
 *                    status = 'sent'`. It cancels whatever task it is given,
 *                    and each cancelled ask sends a „no longer needed" note to
 *                    the REAL PERSON who was asked.
 *
 * So without the guard, a wrong id does not merely fail quietly: somebody
 * else's outgoing questions are withdrawn and the people who received them are
 * told so. That is the harm, and it is two layers away from the line that
 * prevents it.
 *
 * These are source assertions because `executeToolCall` is a closure and this
 * repository has no supertest; the precedent and the reasoning are in
 * `theTypedStopIsReadFirst`. They assert the whole `if (...) {`, never the
 * condition alone — the sweep's mutation used to echo the condition into a
 * comment, which made exactly this kind of test look dead (fixed in 5e19e1d).
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

const GUARD = 'if (closing && (toStop === null || String(toStop.user_id) !== userId)) {';

describe('only the owner’s own goal is closed from a chat', () => {
  it('holds the condition itself', () => {
    expect(chat).toContain(GUARD);
    expect(chat.slice(chat.indexOf(GUARD), chat.indexOf(GUARD) + 120)).toContain(
      'return { updated: false };',
    );
  });

  /**
   * BEFORE `stopGoal`, not after. `stopGoal`'s first act is to mark the thread
   * stopped, so a check that ran afterwards would already have reached into
   * somebody else's conversation.
   */
  it('refuses before anything is stopped', () => {
    const guardAt = chat.indexOf(GUARD);
    const stopAt = chat.indexOf('await stopGoal(', guardAt);

    expect(guardAt).toBeGreaterThan(0);
    expect(stopAt).toBeGreaterThan(guardAt);
  });

  /** The task is read for the comparison, not taken on trust from the input. */
  it('reads the goal it is about to close', () => {
    expect(chat).toContain('const toStop = closing ? await getTaskById(taskIdToUpdate) : null;');
  });

  /**
   * THE REASON THE GUARD MATTERS, PINNED WHERE IT WILL BE READ. If somebody
   * later scopes the cancellation by owner, this assertion fails and whoever
   * changes it updates the note above — which is the point. A dependency
   * nobody records is a dependency somebody removes.
   */
  it('depends on a cancellation that is NOT scoped by owner', () => {
    expect(asks).toContain('export async function cancelAsksForTask(taskId: number)');
    const fn = asks.slice(asks.indexOf('export async function cancelAsksForTask('));
    // The WHERE clause alone: `RETURNING … to_user_id` names a column and is
    // not a scope, and a cruder slice read it as one.
    const where = fn.slice(fn.indexOf('WHERE task_id = $1'), fn.indexOf('RETURNING'));

    expect(where).toContain('WHERE task_id = $1');
    expect(where).not.toContain('user_id');
  });
});
