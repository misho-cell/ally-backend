jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  saveUserNote,
  getUserNotes,
  isUserNoteKind,
  getTonePreference,
  setTonePreference,
} from '../userNotes.service';

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

// Ticket 11 Task 9: the tone preference the profile page reads and writes —
// one `preference` note with a fixed prefix, the note the assistant honours.
describe('the tone preference', () => {
  it('reads the latest tone note without its prefix, or null', async () => {
    mockQuery.mockResolvedValueOnce(result([{ id: 9, text: 'ტონი: მოკლედ, პირდაპირ' }]) as never);
    expect(await getTonePreference(USER)).toEqual({ id: 9, tone: 'მოკლედ, პირდაპირ' });

    mockQuery.mockResolvedValueOnce(result([]) as never);
    expect(await getTonePreference(USER)).toBeNull();
  });

  it('setting a tone replaces the previous one and saves under the prefix', async () => {
    mockQuery
      .mockResolvedValueOnce(result([], 1) as never) // clear the old tone notes
      .mockResolvedValueOnce(result([]) as never) // dedupe lookup
      .mockResolvedValueOnce(result([{ id: 12 }]) as never); // insert

    const saved = await setTonePreference(USER, '  be   warmer ');

    expect(saved).toEqual({ id: 12, tone: 'be warmer' });
    const [deleteSql] = mockQuery.mock.calls[0] as [string];
    expect(deleteSql).toContain("kind = 'preference' AND text LIKE $2 || '%'");
    const insertParams = mockQuery.mock.calls[2][1] as unknown[];
    expect(insertParams).toEqual([USER, 'preference', 'ტონი: be warmer']);
  });

  it('an empty tone is refused', async () => {
    await expect(setTonePreference(USER, '   ')).rejects.toThrow('tone is required');
  });
});
