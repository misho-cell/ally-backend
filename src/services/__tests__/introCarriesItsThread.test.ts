/**
 * ROW 210's WRITE END — five green tests sat over a feature that would have
 * been dead in production, and this is the half that was holding nothing.
 *
 * `introductionResolve.test.ts` covers the READ end thoroughly: the outcome is
 * written into the origin chat when there is no goal, withheld when there is
 * one, skipped when there is no thread either, never doubled into the request's
 * own thread, and silent on a snooze. All five build their fixture row with
 * `origin_thread_id` already set — so all five pass whether or not anything in
 * the product ever sets it.
 *
 * Nothing did, until 21 September 14:39. Before that `origin_thread_id` was
 * NULL on every request, `tellTheChatItWasAskedIn` returned on its second line,
 * and the fault was what a real person lived at 10:19 that morning: she typed
 * „სთხოვე ლიკას გამაცნოს ნიტა ჩხეიძე" into an ordinary chat, the mediator
 * agreed at 10:22, and her chat said nothing. Request 1156, requester_task_id
 * NULL, origin_thread_id NULL.
 *
 * Measured 22 September: 8 of the 8 requests raised since the writer shipped
 * carry the thread. None of those 8 lacked a goal, so the path this exists for
 * has still never run in production. Built and unproven — not fixed.
 */
jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { introContextFor } from '../chat.service';

describe('an introduction remembers where it was asked', () => {
  /**
   * THE ROW 210 CASE. A chat with no goal has nothing to wake, so the thread is
   * the only way an answer can ever reach the person who asked.
   */
  it('carries the thread when the chat has no goal behind it', () => {
    expect(introContextFor(20131, null)).toEqual({ originThreadId: 20131 });
  });

  it('carries both when the chat does have a goal', () => {
    expect(introContextFor(20560, 7162)).toEqual({
      originThreadId: 20560,
      requesterTaskId: 7162,
    });
  });

  /**
   * Two numbers side by side, and swapping them would still typecheck and still
   * look right in a diff. The resolve would then write into a thread id that is
   * really a goal id — into somebody else's conversation, or none.
   */
  it('does not swap the two', () => {
    const ctx = introContextFor(20560, 7162);

    expect(ctx.originThreadId).toBe(20560);
    expect(ctx.requesterTaskId).toBe(7162);
  });

  /**
   * The connector has no conversation and no goal — that is documented on
   * `IntroRequestContext`, and an empty bag is the honest shape. Its users hear
   * the answer through check_my_inbox instead.
   */
  it('carries nothing over the connector, which has neither', () => {
    expect(introContextFor(null, null)).toEqual({});
    expect(introContextFor(undefined, undefined)).toEqual({});
  });

  /**
   * ABSENT, NOT `undefined`. „This request never had one" is the meaning, and a
   * key present with an undefined value reads to anybody scanning the row as a
   * link that was tried and failed.
   */
  it('omits the keys rather than setting them undefined', () => {
    expect(Object.keys(introContextFor(null, null))).toEqual([]);
    expect(Object.keys(introContextFor(20131, null))).toEqual(['originThreadId']);
  });

  /**
   * A goal with no thread cannot happen from the chat surface — the goal is
   * looked up BY the thread — but the function must not invent a thread for it
   * if it ever does.
   */
  it('does not invent a thread when only a goal is known', () => {
    expect(introContextFor(null, 7162)).toEqual({ requesterTaskId: 7162 });
  });
});
