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
    // thread binding null (no thread given) + default ask_first autonomy.
    expect(params as unknown[]).toEqual([
      USER,
      'find a lawyer',
      'for my startup',
      'solve',
      null,
      'ask_first',
    ]);
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

describe('createTask retitles a thread left on a closed goal name (ticket 9 task 31.8)', () => {
  it('replaces the title only when it is a closed goal of this thread', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 77 }], rowCount: 1 } as never);

    await createTask('501', 'ძაღლის ტრენერის პოვნა', null, 'search', 9010);

    const retitle = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE threads'),
    ) as [string, unknown[]];
    expect(retitle[0]).toContain("old.status <> 'open'");
    expect(retitle[0]).toContain('old.title = t.title');
    expect(retitle[1]).toEqual([9010, 'ძაღლის ტრენერის პოვნა']);
  });

  it('does not touch any thread when the goal is not bound to one', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 78 }], rowCount: 1 } as never);

    await createTask('501', 'a goal with no thread', null, 'search');

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE threads'))).toBe(
      false,
    );
  });

  it('caps the new title the same way the rename route does', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 79 }], rowCount: 1 } as never);

    await createTask('501', 'x'.repeat(200), null, 'search', 9010);

    const retitle = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE threads'),
    ) as [string, unknown[]];
    expect((retitle[1][1] as string).length).toBe(80);
  });
});

describe('a thread carries its goal from the moment the goal exists (ticket 9 task 20 e)', () => {
  it('flips is_task on the goal thread at creation, not at finish_task', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 80 }], rowCount: 1 } as never);

    await createTask('501', 'ძაღლის ტრენერის პოვნა', null, 'search', 9010);

    const flag = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('SET is_task = TRUE'),
    ) as [string, unknown[]];
    expect(flag[0]).toContain('is_task = FALSE');
    expect(flag[1]).toEqual([9010]);
  });

  it('does not touch any thread for a goal with no thread', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 81 }], rowCount: 1 } as never);

    await createTask('501', 'a goal with no thread', null, 'search');

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('SET is_task = TRUE'))).toBe(
      false,
    );
  });
});
