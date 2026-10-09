import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { ADMIN_UPDATES_READ_LIMIT, updatesForAdmin } from '../pendingUpdates.service';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

const mockQuery = query as jest.MockedFunction<typeof query>;

/** 1692 (the tester's 10:24Z / 10:31Z): one user's update cards, from the admin side. */
describe('the admin read of a user’s update cards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns kind, status, release time and payload, newest first, limited', async () => {
    const row = {
      id: 29239,
      task_id: null,
      kind: 'debrief',
      status: 'held',
      release_at: '2026-10-12T10:18:13Z',
      created_at: '2026-10-09T10:18:13Z',
      payload: { about: 'relayed_ask', ask_id: 18052 },
    };
    mockQuery.mockResolvedValueOnce({ rows: [row] } as never);
    await expect(updatesForAdmin('181309')).resolves.toEqual([row]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('WHERE user_id = $1');
    expect(String(sql)).toContain('ORDER BY id DESC');
    expect(params).toEqual(['181309', ADMIN_UPDATES_READ_LIMIT]);
  });

  it('fails loudly rather than answering with nothing', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(updatesForAdmin('181309')).rejects.toThrow('timeout');
  });

  it('is an admin GET that refuses a non-numeric user', () => {
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("adminRouter.get('/users/:userId/updates'");
    const route = admin.slice(admin.indexOf("adminRouter.get('/users/:userId/updates'"));
    expect(route.slice(0, 400)).toContain(
      "res.status(400).json({ success: false, error: 'userId უნდა იყოს რიცხვი' })",
    );
  });
});
