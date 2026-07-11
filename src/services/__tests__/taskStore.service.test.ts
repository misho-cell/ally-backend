jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { createTask, getMyTasks, updateTask, grantTaskPermission } from '../taskStore.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function result(rows: unknown[], rowCount = rows.length): { rows: unknown[]; rowCount: number } {
  return { rows, rowCount };
}

const USER = '501';

beforeEach(() => jest.clearAllMocks());

describe('taskStore.service', () => {
  it('createTask inserts and returns the new id', async () => {
    mockQuery.mockResolvedValue(result([{ id: 7 }]) as never);

    const out = await createTask(USER, 'find a lawyer', 'for my startup', 'solve');

    expect(out).toEqual({ id: 7 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('INSERT INTO tasks');
    expect(params as unknown[]).toEqual([USER, 'find a lawyer', 'for my startup', 'solve']);
  });

  it('getMyTasks scopes to the user and passes the optional status filter', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    await getMyTasks(USER, 'open');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(USER);
    expect(params[1]).toBe('open');
  });

  it('getMyTasks passes null status when none given', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    await getMyTasks(USER);

    expect((mockQuery.mock.calls[0][1] as unknown[])[1]).toBeNull();
  });

  it("updateTask reports false when no row matched (not the user's task)", async () => {
    mockQuery.mockResolvedValue(result([], 0) as never);

    const ok = await updateTask(USER, 999, 'closed', 'done');

    expect(ok).toBe(false);
  });

  it('updateTask reports true when a row was updated', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    expect(await updateTask(USER, 7, 'paused')).toBe(true);
  });

  it('grantTaskPermission scopes to the owner and reports success', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    const ok = await grantTaskPermission(USER, 7);

    expect(ok).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('permission_granted = true');
    expect(params as unknown[]).toEqual([7, USER]);
  });
});
