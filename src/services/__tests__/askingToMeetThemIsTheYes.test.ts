import { readFileSync } from 'fs';
import { join } from 'path';

const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => mockQuery(...args),
  default: {},
}));

import { yesToTheirWaitingRequest } from '../introduction.service';

/**
 * Lika's podcast test (12 Nov, B02/B04): the person a request was meant to
 * reach wrote „connect me with him directly" while the server's question —
 * „do you want to meet him?" — waited on them. A new request went out, and the
 * asker was asked, as a go-between, whether he wanted to meet the person he had
 * asked for. Asking to meet somebody whose request to meet you waits on your
 * answer is that yes.
 */
describe('asking to meet somebody whose own request waits on you', () => {
  beforeEach(() => mockQuery.mockReset());

  it('looks for their waiting request by the number asked for', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(yesToTheirWaitingRequest('7', ['+995 555 000 111', undefined])).resolves.toBe(
      null,
    );
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ir.status = 'accepted' AND ir.target_answered_at IS NULL");
    expect(sql).toContain('JOIN "UserPhone" up ON up."userId" = ir.requester_user_id');
    expect(params[0]).toBe('7');
    expect(params[1]).toEqual(['555000111']);
  });

  it('reads nothing without a whole number', async () => {
    await expect(yesToTheirWaitingRequest('7', [undefined, '12'])).resolves.toBe(null);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is asked before any new request is made', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const waits = chat.indexOf('const waitingYes = await yesToTheirWaitingRequest(userId, [');
    const goal = chat.indexOf(
      'const goalForIntro = threadId == null ? null : await getOpenTaskByThread(threadId);',
    );
    expect(waits).toBeGreaterThan(0);
    expect(waits).toBeLessThan(goal);
  });
});
