jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { logSearchActivity } from '../abuseDetection.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => jest.clearAllMocks());

describe('logSearchActivity', () => {
  it('returns the inserted row id — the outcome ladder needs it to record a later outcome against this exact search', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)'))
        return Promise.resolve(rows([{ hourly: 1, same_target: 0 }]) as never);
      return Promise.resolve(rows([{ id: 8532 }]) as never);
    });

    const id = await logSearchActivity('501', 'name', 'gio tabidze', 3);

    expect(id).toBe(8532);
  });

  it('auto-marks outcome "no_result" when the search found nothing — ticket 6\'s first ladder rung needs no separate signal', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)'))
        return Promise.resolve(rows([{ hourly: 1, same_target: 0 }]) as never);
      return Promise.resolve(rows([{ id: 1 }]) as never);
    });

    await logSearchActivity('501', 'name', 'nobody findable', 0);

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO'),
    );
    expect(insertCall?.[1]).toEqual(['501', 'nobody findable', 'name', false, 0, 'no_result']);
  });

  it('leaves outcome NULL when the search found something — a real signal, not a guess, decides the rest of the ladder', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)'))
        return Promise.resolve(rows([{ hourly: 1, same_target: 0 }]) as never);
      return Promise.resolve(rows([{ id: 1 }]) as never);
    });

    await logSearchActivity('501', 'name', 'gio tabidze', 3);

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO'),
    );
    expect(insertCall?.[1]).toEqual(['501', 'gio tabidze', 'name', false, 3, null]);
  });

  it('returns null without querying for an empty query string', async () => {
    const id = await logSearchActivity('501', 'name', '   ', 0);
    expect(id).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
