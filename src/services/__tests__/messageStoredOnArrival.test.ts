const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: mockQuery,
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { keepUserMessage } from '../chat.service';

/**
 * Ticket 20 row 212 — the two messages were stored in the wrong order.
 *
 * Row 209's queue stored the QUEUED message the moment it arrived, and left
 * the first one to the ordinary write inside the run — which happens after the
 * prompt is built, about three seconds later. So the second message got the
 * earlier timestamp. The seat found it within an hour of the deploy, on three
 * conversations out of four:
 *
 *   18021  second 17:49:07.043, first 17:49:07.198   inverted by 155 ms
 *   18052  second 17:51:06.041, first 17:51:06.932   inverted by 891 ms
 *   18085  second 17:53:04.298, first 17:53:04.678   inverted by 380 ms
 *
 * Both members of each pair land inside one second although they were typed
 * three apart. On 18052 the thread ends up reading „Now double the number you
 * just gave me" ABOVE „Give me one number between 10 and 99" — and everything
 * that re-reads the thread later, the model included, sees them backwards.
 *
 * The fix is that every message is stored on arrival, so there is no longer a
 * fast path and a slow path to get out of step. What this file holds is the
 * part of that which can go silently wrong: the caller stops the run writing
 * the message a second time, and it may only do that if the first write
 * actually happened.
 */
beforeEach(() => jest.clearAllMocks());

describe('storing the owner’s message when it arrives', () => {
  it('reports that it stored, so the run can be told not to store it again', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'row-1' }], rowCount: 1 });
    await expect(keepUserMessage('501', 18052, 'Give me one number')).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('reports FAILURE rather than throwing, so the caller is never taken down with it', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));
    await expect(keepUserMessage('501', 18052, 'Give me one number')).resolves.toBe(false);
  });

  /**
   * The asymmetry that makes this worth its own test. A message stored twice
   * is untidy; a message stored NEITHER here nor in the run is the owner's own
   * words gone, which is the fault this whole family started with — Lika's
   * goal, twice in five minutes, on an exhausted balance.
   *
   * So the flag the caller sets must follow the WRITE and not the intention:
   * false here has to leave the ordinary write inside the run standing as the
   * fallback.
   */
  it('a failed write is a false, which is what keeps the fallback in place', async () => {
    mockQuery.mockRejectedValueOnce(new Error('deadlock detected'));
    const stored = await keepUserMessage('501', 18052, 'Now double it');
    expect(stored).toBe(false);
    // And nothing about the failure leaks upward as an unhandled rejection —
    // this runs on a request that has already answered 202.
    expect(stored).not.toBeUndefined();
  });

  it('stores the message as the owner’s own words, not as an event', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'row-1' }], rowCount: 1 });
    await keepUserMessage('501', 18052, 'Now double it');
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('user');
    expect(params).toContain('Now double it');
    // kind 'message' — an 'event' row is one the model reads and the person
    // never sees, and this is the person's own sentence.
    expect(params).toContain('message');
  });
});
