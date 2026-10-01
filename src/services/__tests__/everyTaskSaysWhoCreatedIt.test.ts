jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  authorForLogin,
  createTeamTask,
  isTeamTaskAuthor,
  listTeamTasks,
  TeamTaskAuthor,
  updateTeamTask,
} from '../teamTasks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (list: readonly unknown[]): never => ({ rows: list, rowCount: list.length }) as never;
const ROW = {
  id: 1,
  created_by: 'giorgi',
  problem: 'p',
  task: 't',
  priority: 2,
  status: 'to_build',
  page: 1,
  created_at: '2026-10-01T19:20:00Z',
  updated_at: '2026-10-01T19:20:00Z',
};

beforeEach(() => jest.clearAllMocks());

/**
 * M2 (plate v288; Misho, 1 October): every task on the team's board says who
 * created it — Tornike / Giorgi / Lika / Ninia / AI — decided by the login.
 */
describe('who a login files tasks as', () => {
  it('Tornike by his own account, without reading anything', async () => {
    expect(await authorForLogin('501')).toBe(TeamTaskAuthor.Tornike);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a staff account by its team name', async () => {
    mockQuery.mockResolvedValue(rows([{ name: 'Gio' }]));
    expect(await authorForLogin('173527')).toBe(TeamTaskAuthor.Giorgi);
    mockQuery.mockResolvedValue(rows([{ name: 'Ninia' }]));
    expect(await authorForLogin('173529')).toBe(TeamTaskAuthor.Ninia);
  });

  it('nobody for the shared login, which must name its author', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(await authorForLogin('167250')).toBeNull();
  });

  it('accepts only the fixed authors from the shared login', () => {
    expect(isTeamTaskAuthor('ai')).toBe(true);
    expect(isTeamTaskAuthor('somebody')).toBe(false);
  });
});

describe('the board', () => {
  it('writes the author and the login the server saw, with a timeout', async () => {
    mockQuery.mockResolvedValue(rows([ROW]));
    const task = await createTeamTask({
      author: TeamTaskAuthor.Giorgi,
      postedBy: '173527',
      problem: ' a problem ',
      task: ' a task ',
    });
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO team_tasks');
    expect(params).toEqual(['giorgi', '173527', 'a problem', 'a task', 2]);
    expect(timeout).toBeGreaterThan(0);
    expect(task.created_by).toBe('giorgi');
    expect(task.created_at).toBe('2026-10-01T19:20:00.000Z');
  });

  it('lists one page, bounded, most urgent first', async () => {
    mockQuery.mockResolvedValue(rows([ROW]));
    await listTeamTasks(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('ORDER BY page, priority, id');
    expect(String(sql)).toContain('LIMIT');
    expect(params).toEqual([2]);
  });

  it('changes only what was sent, and says when there is no such task', async () => {
    mockQuery.mockResolvedValue(rows([]));
    expect(await updateTeamTask(9, { page: 2 })).toBeNull();
    expect(mockQuery.mock.calls[0][1]).toEqual([9, null, null, 2]);
  });
});

describe('where it is wired', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  it('takes the author from the login before anything the body says', () => {
    const post = route.slice(route.indexOf("adminRouter.post(\n  '/team-tasks'"));
    expect(post.slice(0, 2000)).toContain('const fromLogin = await authorForLogin(adminId);');
    expect(post.slice(0, 2000)).toContain('fromLogin ?? (isTeamTaskAuthor(input.created_by)');
  });

  it('has the five fields and the page in the table', () => {
    const migration = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '193_team_tasks.sql'),
      'utf8',
    );
    for (const column of ['created_by', 'problem', 'task', 'priority', 'status', 'page']) {
      expect(migration).toContain(column);
    }
  });
});
