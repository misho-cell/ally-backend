const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { goalHasAcceptedIntroduction } from '../introInstruction';

beforeEach(() => jest.resetAllMocks());

/** Misho's yes, 2 Nov (the 1 Nov daily check): an accepted introduction is not asked for again. */
describe('an ask after the introduction was accepted', () => {
  it('reads an accepted introduction on the goal, with a timeout', async () => {
    mockQuery.mockResolvedValue({ rows: [{ accepted: true }] });
    expect(await goalHasAcceptedIntroduction(7)).toBe(true);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain("requester_task_id = $1 AND status = 'accepted'");
    expect(params).toEqual([7]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('keeps the guard when the lookup fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    expect(await goalHasAcceptedIntroduction(7)).toBe(false);
  });

  it('is not turned back into an introduction request', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('error: USE_INTRODUCTION_REFUSAL');
    expect(chat.slice(at - 600, at)).toContain('!(await goalHasAcceptedIntroduction(taskId))');
  });
});
