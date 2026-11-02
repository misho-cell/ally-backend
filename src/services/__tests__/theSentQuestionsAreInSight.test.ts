const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  default: {},
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { getSentAsksForOwner, SENT_ASKS_SHOWN } from '../taskAsks.service';

beforeEach(() => jest.resetAllMocks());

/**
 * #8523 (the tester's 80752 item 9, case 89): asked about the questions they
 * sent, the run could not see any of them and said it could not confirm a send.
 */
describe('the questions the owner sent', () => {
  it('are read from the owner’s open goals, newest first, bounded, with a timeout', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ task_id: 7, goal: 'ნოტარიუსი', to_name: 'გია', status: 'sent', sent_at: 'x' }],
    });
    const asks = await getSentAsksForOwner('42');
    expect(asks).toHaveLength(1);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain(
      "ta.from_user_id = $1::int AND t.user_id = $1::text AND t.status = 'open'",
    );
    expect(sql).toContain('ORDER BY ta.created_at DESC');
    expect(sql).not.toContain('ta.question');
    expect(params).toEqual(['42', SENT_ASKS_SHOWN]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('come back with the goals list, which still answers when they cannot be read', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'get_my_tasks': {"));
    const body = handler.slice(0, handler.indexOf("case 'update_task':"));
    expect(body).toContain('getSentAsksForOwner(userId).catch(');
    expect(body).toContain('return { ...page, sent_asks: sentAsks };');
  });
});
