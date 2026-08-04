jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { saveUserNote, getUserNotes, isUserNoteKind } from '../userNotes.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function result(rows: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows, rowCount: rows.length };
}

const USER = '501';

beforeEach(() => jest.clearAllMocks());

describe('userNotes.service', () => {
  it('saveUserNote inserts a NEW note and returns its id', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM user_notes')) return Promise.resolve(result([]) as never);
      return Promise.resolve(result([{ id: 3 }]) as never);
    });

    const out = await saveUserNote(USER, 'need', 'looking for a co-founder');

    expect(out).toEqual({ id: 3 });
    const insert = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO user_notes'),
    );
    expect(insert?.[1]).toEqual([USER, 'need', 'looking for a co-founder']);
  });

  it('saveUserNote never stores the same text twice (dedupe)', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM user_notes'))
        return Promise.resolve(result([{ id: 7 }]) as never);
      return Promise.resolve(result([{ id: 99 }]) as never);
    });

    const out = await saveUserNote(USER, 'preference', '  Keep answers short ');

    expect(out).toEqual({ id: 7 });
    expect(
      mockQuery.mock.calls.some((c) => (c[0] as string).includes('INSERT INTO user_notes')),
    ).toBe(false);
  });

  it('getUserNotes scopes to the user and filters by kind when given', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    await getUserNotes(USER, 'preference');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(USER);
    expect(params[1]).toBe('preference');
  });

  it('getUserNotes passes null kind when none given', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    await getUserNotes(USER);

    expect((mockQuery.mock.calls[0][1] as unknown[])[1]).toBeNull();
  });

  it('isUserNoteKind validates the enum', () => {
    expect(isUserNoteKind('need')).toBe(true);
    expect(isUserNoteKind('profile')).toBe(true);
    expect(isUserNoteKind('zodiac')).toBe(false);
  });
});
