import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * TWO GUARDS ON THE STOP PATH THAT NOTHING HELD, found by the block-mode
 * sabotage sweep on 27 September. Both could be turned into `if (false)` with
 * 4,955 tests green, and both are on the one button a person presses when they
 * want us to STOP WRITING TO PEOPLE.
 *
 * ═══ 1. A TYPED STOP MUST NOT WAIT IN THE QUEUE IT IS TRYING TO EMPTY ═══
 *
 *     if (!stopCannotWait) {  →  if (false) {
 *
 * With that line dead, a message the server has just recognised as a stop goes
 * into `enterThread` and waits behind the very run it is asking to end.
 *
 * THE WAIT IS NOT SMALL, and it is worth doing the arithmetic rather than
 * saying „a delay": THREAD_QUEUE_BUDGET_MS is RUN_HARD_TIMEOUT_MS + 15s, which
 * is RUN_WALL_CLOCK_BUDGET_MS + 20s + 15s — 90 + 20 + 15 = ONE HUNDRED AND
 * TWENTY-FIVE SECONDS. Two minutes of a run that is still calling
 * `ask_contact` while the owner has already typed „stop".
 *
 * That is row 113's harm with a different door: not „the stop was ignored" but
 * „the stop was queued", which looks like patience from the outside and is the
 * same thing to the people being written to.
 *
 * ═══ 2. A STOP THAT STOPPED NOTHING MUST NOT ANSWER „DONE" ═══
 *
 *     if (stopped === null) {  →  if (false) {
 *
 * `stopGoalOnThread` returns null when there is no such thread for that owner.
 * Without the guard the route answers `200 { success: true, data: null }` — the
 * owner is told the goal stopped, and nothing stopped. An error wearing the
 * clothes of a confident answer, on the stop button, which is the worst place
 * in the product for that particular lie.
 *
 * ⚠️ WHY THESE ARE SOURCE ASSERTIONS AND WHAT THAT IS WORTH.
 *
 * The handlers are closures inside `threadsRouter` and this repository has no
 * supertest, so the line cannot be driven without either adding a dependency
 * or refactoring a hot route — neither of which belongs in a test. The house
 * precedent is `theTypedStopIsReadFirst.test.ts`, which holds the same kind of
 * wire the same way and says so.
 *
 * So: these assert the GUARD ITSELF, never the lines around it. That
 * distinction is not pedantry — an earlier file in this project asserted
 * everything around its guard, passed, and passed again with the guard
 * deleted. A text test catches the guard being removed or rewritten. It cannot
 * catch the guard being reached with the wrong value, and I am not going to
 * imply otherwise.
 */
const routes = readFileSync(join(__dirname, '..', 'threads.routes.ts'), 'utf8');

describe('a typed stop skips the queue', () => {
  it('holds the condition itself', () => {
    expect(routes).toContain('const stopCannotWait = looksLikeStopRequest(message);');
    expect(routes).toContain('if (!stopCannotWait) {');
  });

  /**
   * AND THE WAIT IS INSIDE IT. The guard is worth nothing if `enterThread`
   * also runs outside the branch — the stop would skip one wait and take
   * another.
   */
  it('keeps the queue wait inside the branch it guards', () => {
    const at = routes.indexOf('if (!stopCannotWait) {');
    const branch = routes.slice(at, at + 1_200);

    expect(branch).toContain('await enterThread(');
    // Once in the whole handler: the branch's copy is the only one.
    expect(routes.split('await enterThread(').length - 1).toBe(1);
  });
});

describe('a stop that stopped nothing says so', () => {
  it('holds the null check and the 404 it answers with', () => {
    const at = routes.indexOf('const stopped = await stopGoalOnThread(');
    const after = routes.slice(at, at + 400);

    expect(after).toContain('if (stopped === null) {');
    expect(after).toContain('res.status(404)');
  });

  /** The success answer is the row, never an empty one. */
  it('only reports success with something to report', () => {
    const at = routes.indexOf('const stopped = await stopGoalOnThread(');
    const after = routes.slice(at, at + 600);

    expect(after).toContain('res.status(200).json({ success: true, data: stopped });');
  });
});
