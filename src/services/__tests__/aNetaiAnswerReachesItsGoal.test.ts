const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockWake = jest.fn();
jest.mock('../taskEngine.service', () => ({
  wakeTask: (...a: unknown[]) => mockWake(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  NETAI_REPLY_WAKES_GOAL,
  netaiReplyWakeText,
  wakeGoalWithNetaiReply,
} from '../netaiReplyWake.service';
import { isOpenGoalOf } from '../netaiMessage.service';

beforeEach(() => jest.resetAllMocks());

/** #7825: Korneli's „ვკითხოთ" under a message about his goal sat 28 hours. */
describe('an answer to a Netai message about a goal reaches that goal', () => {
  it('is ON, and reads nothing when switched off', async () => {
    expect(NETAI_REPLY_WAKES_GOAL).toBe(true);
    expect(await wakeGoalWithNetaiReply(64696, 1053, 'ვკითხოთ', false)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockWake).not.toHaveBeenCalled();
  });

  it('wakes the open goal the latest message was about, with both texts', async () => {
    mockQuery.mockResolvedValue({ rows: [{ task_id: 30838, body: 'ლევანს ჰკითხე?' }] });
    mockWake.mockResolvedValue('woken');
    expect(await wakeGoalWithNetaiReply(64696, 1053, 'ვკითხოთ', true)).toBe(true);
    expect(mockWake).toHaveBeenCalledWith(
      30838,
      expect.stringContaining('«ვკითხოთ»'),
      undefined,
      'owner',
    );
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain("t.status = 'open' AND t.user_id = m.user_id::text");
    expect(params).toEqual([64696, 1053]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('wakes nothing for a message about no goal, and never throws', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await wakeGoalWithNetaiReply(1, 2, 'x', true)).toBe(false);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await wakeGoalWithNetaiReply(1, 2, 'x', true)).toBe(false);
    expect(mockWake).not.toHaveBeenCalled();
  });

  it('keeps what the person typed as typed', () => {
    expect(netaiReplyWakeText('m', 'a $& b')).toContain('«a $& b»');
  });

  it('links a message only to an open goal of its own person', async () => {
    mockQuery.mockResolvedValue({ rows: [{ found: false }] });
    expect(await isOpenGoalOf(5, 7)).toBe(false);
    expect(mockQuery.mock.calls[0][1]).toEqual([5, 7]);
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("'task_id is not an open goal of this person.'");
    const threads = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    expect(threads).toContain('void wakeGoalWithNetaiReply(threadId, Number(userId), message);');
  });
});
