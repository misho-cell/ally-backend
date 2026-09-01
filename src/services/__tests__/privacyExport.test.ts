jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { exportMyData } from '../privacyRights.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

// This export is the answer to a person asking what we hold about them. Its
// failure mode matters as much as its content: a table we could not read must
// never come back looking like a table with nothing in it.
describe('exportMyData — a table we could not read is never reported as empty', () => {
  beforeEach(() => jest.clearAllMocks());

  function route(onOwnedTable: (table: string) => Promise<unknown>): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('information_schema.columns'))
        return Promise.resolve(rows([{ column_name: 'id' }, { column_name: 'name' }]) as never);
      if (sql.includes('FROM "User" WHERE id = $1'))
        return Promise.resolve(rows([{ id: 1, name: 'ნინო' }]) as never);
      const table = /FROM (\w+) WHERE/.exec(sql)?.[1] ?? '';
      return onOwnedTable(table) as Promise<never>;
    });
  }

  it('marks a table unavailable when its read fails, instead of dropping it silently', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    route((table) =>
      table === 'user_notes'
        ? Promise.reject(new Error('canceling statement due to statement timeout'))
        : Promise.resolve(rows([])),
    );

    const data = await exportMyData('1');

    expect(data.user_notes).toEqual({ rows: [], truncated: false, unavailable: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('stays silent about a table that does not exist in this environment', async () => {
    const missing = Object.assign(new Error('relation "user_avatars" does not exist'), {
      code: '42P01',
    });
    route((table) =>
      table === 'user_avatars' ? Promise.reject(missing) : Promise.resolve(rows([])),
    );

    const data = await exportMyData('1');

    expect(data).not.toHaveProperty('user_avatars');
  });

  it('returns the rows of a table that reads cleanly', async () => {
    route((table) =>
      table === 'user_notes'
        ? Promise.resolve(rows([{ id: 1, text: 'შენიშვნა' }]))
        : Promise.resolve(rows([])),
    );

    const data = await exportMyData('1');

    expect(data.user_notes).toEqual({
      rows: [{ id: 1, text: 'შენიშვნა' }],
      truncated: false,
    });
  });
});
