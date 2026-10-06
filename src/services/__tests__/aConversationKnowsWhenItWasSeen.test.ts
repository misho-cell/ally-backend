jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { markThreadSeen } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * #1817 (Ninia; the frontend, 6 Oct 11:30Z): a goal must stay on top until its
 * owner has seen the answer, and „seen" lives on the server so a read on one
 * device counts on all of them.
 */
beforeEach(() => mockQuery.mockReset());

describe('marking a conversation seen', () => {
  it('stamps only the owner’s own thread and returns the time', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ seen_at: new Date('2026-10-06T11:40:00Z') }],
    } as never);

    expect(await markThreadSeen(41, '501')).toBe('2026-10-06T11:40:00.000Z');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('WHERE id = $1 AND user_id = $2');
    expect(params).toEqual([41, '501']);
  });

  it('returns null for a thread that is not theirs, which the route answers with 404', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await markThreadSeen(41, '999')).toBeNull();

    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    const at = routes.indexOf("'/:id/seen'");
    const handler = routes.slice(at, at + 1_500);
    expect(handler).toContain('const seenAt = await markThreadSeen(threadId, userId);');
    expect(handler).toContain('if (seenAt === null) {\n        res.status(404)');
    expect(handler).toContain('emitThreadUpdated(userId, { id: threadId, seen_at: seenAt });');
    expect(handler).toContain('rateLimit(');
  });
});

describe('the list and the deploy', () => {
  it('carries seen_at on GET /threads', () => {
    const service = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    expect(service).toContain('       t.seen_at,\n');
  });

  it('stamps every existing conversation, so old finished goals do not climb to the top', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'db',
        'postgres',
        'migrations',
        '208_a_conversation_knows_when_it_was_seen.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('UPDATE threads SET seen_at = NOW() WHERE seen_at IS NULL;');
  });
});

describe('#1816: a payment push lands on the profile page', () => {
  it('carries url /profile on both top-up pushes', () => {
    for (const file of ['stripeTopup.service.ts', 'paddle.service.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(source).toContain('url: PAYMENT_PUSH_URL,');
    }
    const notification = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');
    expect(notification).toContain("export const PAYMENT_PUSH_URL = '/profile';");
  });
});
