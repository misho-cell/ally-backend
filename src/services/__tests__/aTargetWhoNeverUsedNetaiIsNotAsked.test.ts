jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { targetUsesNetai } from '../introduction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * Lika's manual test (6 Nov): the target had an old account, never used Netai,
 * and was „asked first" twice — the owner would have waited for ever.
 */
describe('a target who never used Netai', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is read by what they did in Netai, not by having an account', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await targetUsesNetai(5)).toBe(false);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] } as never);
    expect(await targetUsesNetai(5)).toBe(true);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('search_activity');
  });

  it('counts as using it when that cannot be read, as before', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await targetUsesNetai(5)).toBe(true);
  });

  it('is not asked first: the handover goes off Netai', () => {
    const src = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
    const check = src.indexOf(
      'if (targetUserId !== null && !(await targetUsesNetai(targetUserId))) targetUserId = null;',
    );
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf('const asksTheTargetFirst ='));
  });
});
