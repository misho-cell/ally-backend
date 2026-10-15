jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getMyTasksPage } from '../taskStore.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
const LISTED = 50;
const OPEN = 74;

/**
 * Lika's №134 (15 Oct): „რა ღია დავალებები გვაქვს?" was answered „50 open" of
 * her 74 — the tool lists the newest 50 and gave no total beside them.
 */
describe('the open goals the in-app tool reads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('come with the whole count, not the size of the page', async () => {
    const page = Array.from({ length: LISTED }, (_, i) => ({ id: i + 1, title: `goal ${i + 1}` }));
    mockQuery.mockImplementation((sql: unknown) =>
      Promise.resolve({
        rows: String(sql).includes('COUNT(*)') ? [{ count: String(OPEN) }] : page,
        rowCount: 0,
      } as never),
    );
    const result = await getMyTasksPage(OWNER, 'open');
    expect(result.tasks).toHaveLength(LISTED);
    expect(result.total).toBe(OPEN);
  });

  it('count with the same exclusion as the list', async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: '0' }], rowCount: 0 } as never);
    await getMyTasksPage(OWNER, 'open');
    const count = mockQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('COUNT(*)'));
    expect(count).toContain('hidden_goals');
  });

  it('is what get_my_tasks answers in the app', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const tool = chat.slice(chat.indexOf("case 'get_my_tasks': {"));
    expect(tool.slice(0, tool.indexOf("case 'update_task'"))).toContain(
      'return getMyTasksPage(userId, status);',
    );
  });
});
