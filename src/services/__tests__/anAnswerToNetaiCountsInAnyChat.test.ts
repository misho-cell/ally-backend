const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { recordNetaiReplyElsewhere } from '../netaiMessage.service';

beforeEach(() => jest.resetAllMocks());

/** #7825: Keti and Merab answered a Netai message in their goal chat; the team never saw it. */
describe('an answer to a Netai message counts in any chat', () => {
  it('marks the newest unanswered Netai message of the last day, with the chat it came in', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 37 }] });
    expect(await recordNetaiReplyElsewhere(63385, 524, 'ოკ ველი თარიღებს')).toBe(true);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain('reply_thread_id = $1');
    expect(sql).toContain('reply IS NULL AND thread_id <> $1');
    expect(sql).toContain('make_interval(hours => $4)');
    expect(params).toEqual([63385, 524, 'ოკ ველი თარიღებს', 24]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('changes nothing when no Netai message waits for an answer', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await recordNetaiReplyElsewhere(1, 2, 'hello')).toBe(false);
  });

  it('runs on every ordinary message, after the Netai chat keeps its own', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    const own = routes.indexOf('await recordNetaiReply(threadId, Number(userId), message);');
    const elsewhere = routes.indexOf(
      'void recordNetaiReplyElsewhere(threadId, Number(userId), message)',
    );
    expect(own).toBeGreaterThan(0);
    expect(elsewhere).toBeGreaterThan(own);
  });
});
