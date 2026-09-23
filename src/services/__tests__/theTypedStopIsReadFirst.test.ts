import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * NINE TESTS ON THE PREDICATE, NONE ON THE LINE THAT CALLS IT.
 *
 * Multi-line sabotage, 22 September: the condition of
 * `if (!ownerAbsent && looksLikeStopRequest(userMessage))` replaced with
 * `false` — the whole suite passed, `stopIntent.test.ts` included. That file
 * holds `looksLikeStopRequest` from nine angles and asks nothing about whether
 * anybody consults it. The same shape as the SSRF guard earlier tonight, and
 * as `registryParity` before it, and it keeps being the shape.
 *
 * WHAT THE INTERCEPT IS FOR, from the tester's own reading of goal 4724 /
 * thread 16836:
 *
 *   17:43:53.119  present_choices — the write stage starts
 *   17:43:54.08   the owner types the stop
 *   17:43:58.607  their line is stored
 *   17:44:00.027  the run's reply is stored ANYWAY, with two buttons
 *   17:44:05.581  update_task finally closes the goal
 *
 * Eleven seconds between the owner pressing enter and anything knowing, because
 * a typed stop did nothing until the model chose to act on it. The intercept is
 * what closed that: the server reads the owner's own words BEFORE the run does
 * anything, and does not wait to be told.
 *
 * It also matters for a goal that is PAUSED. A paused goal's chat shows no stop
 * button at all, so the typed line is the only way back — which is how thread
 * 16842 was left with nothing to answer, after which the model went looking for
 * a goal of its own choosing and closed two real ones.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const GUARD = 'if (!ownerAbsent && looksLikeStopRequest(userMessage)) {';

describe('the owner’s typed stop is read by the server, before the run', () => {
  it('holds the condition itself, not merely the lines around it', () => {
    // Written this way on purpose: an earlier file tonight asserted everything
    // AROUND its guard, passed, and passed again with the guard removed.
    expect(chat).toContain(GUARD);
  });

  /**
   * IT IS THE FIRST THING `processChat` DOES, AND IT RETURNS.
   *
   * „Before the model" cannot be asserted by position — the model loop is
   * earlier in the file than this handler, because a file is not an execution
   * order, and my first attempt at this test asserted exactly that and failed
   * for the right reason. What CAN be asserted is the two things that make it
   * early: it sits at the top of processChat, and it returns the stop line
   * rather than falling through to the run.
   */
  it('sits at the top of processChat and returns instead of falling through', () => {
    const fnAt = chat.indexOf('export async function processChat(');
    const guardAt = chat.indexOf(GUARD);

    expect(fnAt).toBeGreaterThan(0);
    expect(guardAt).toBeGreaterThan(fnAt);
    // Within the first two hundred lines of it, not buried in the middle.
    expect(chat.slice(fnAt, guardAt).split('\n').length).toBeLessThan(200);

    // The block is long — it stores the owner's line, closes the goal,
    // cancels the asks and settles the thread — so the window has to cover it.
    const after = chat.slice(guardAt, guardAt + 7000);
    expect(after).toContain('return { reply: said, stopped: true');
  });

  /**
   * ONLY THE OWNER'S OWN WORDS. `!ownerAbsent` is half the condition and the
   * half with teeth: an engine wake's „userMessage" is an event sentence the
   * SERVER wrote, and some of those talk about stopping. A wake that read its
   * own event as a stop request would close the goal it was sent to work on.
   */
  it('never lets an engine run read its own event as a stop', () => {
    expect(chat).toContain('!ownerAbsent && looksLikeStopRequest');
  });

  /**
   * WHATEVER THE GOAL'S STATUS. A paused goal shows no stop button, so the
   * typed line is the only way back — `getGoalOnThread` rather than an
   * open-only lookup, and the comment beside it names the thread it cost.
   */
  it('looks up the thread’s goal whatever state it is in', () => {
    const at = chat.indexOf(GUARD);
    const block = chat.slice(at, at + 700);

    expect(block).toContain('getGoalOnThread(threadId)');
    expect(block).not.toContain('getOpenTaskByThread');
  });

  /**
   * And a failure to READ the goal must not be read as „there is no goal".
   * Refusing to act on a database error is the difference between „nothing to
   * stop" and „we could not look".
   */
  it('says so rather than guessing when it cannot read the goal', () => {
    const at = chat.indexOf(GUARD);
    const block = chat.slice(at, at + 700);

    expect(block).toContain('could not read the thread');
  });
});
