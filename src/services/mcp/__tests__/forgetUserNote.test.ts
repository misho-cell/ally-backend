// Ticket 19, the founder's heads-up of 13 September: asked in chat to delete
// one saved note, the product answered „record deleted" and the note was still
// there. There was no tool for it — only forget_contact_fact, which deletes a
// CONTACT's fact and can never touch a note the user wrote about themselves —
// so the model reached for the nearest thing and reported a success it had not
// achieved. The data page promises the user they can delete everything they
// told us; that promise breaks the first time the product says „done" and
// means nothing.
jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../userNotes.service', () => ({
  __esModule: true,
  deleteUserNotes: jest.fn(),
  getUserNotes: jest.fn(),
  isUserNoteKind: jest.fn(() => false),
  saveUserNote: jest.fn(),
}));

import { deleteUserNotes, getUserNotes } from '../../userNotes.service';
import { mcpForgetUserNote, mcpGetUserNotes } from '../handlers';

const mockDelete = deleteUserNotes as jest.MockedFunction<typeof deleteUserNotes>;
const mockGet = getUserNotes as jest.MockedFunction<typeof getUserNotes>;

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-refs';
});
beforeEach(() => jest.clearAllMocks());

describe('a note the user can actually point at', () => {
  it('gives every note a ref, because a note that cannot be named cannot be deleted', async () => {
    mockGet.mockResolvedValue([
      { id: 42, kind: 'preference', text: 'keep answers short', created_at: '2026-09-01' },
    ]);

    const out = (await mcpGetUserNotes('501', {})) as {
      notes: { note_ref: string; text: string }[];
    };

    // The connector used to return kind and text only — nothing to address.
    expect(out.notes[0].note_ref).toBe('note_42');
  });
});

describe('deleting one, and never claiming more than happened', () => {
  it('deletes the note the ref names, scoped to the caller', async () => {
    mockDelete.mockResolvedValue({ deleted: 1 });

    const out = await mcpForgetUserNote('501', { note_ref: 'note_42' });

    expect(mockDelete).toHaveBeenCalledWith('501', [42]);
    expect(out).toEqual({ deleted: true, count: 1 });
  });

  it('says plainly when nothing was deleted, and forbids saying otherwise', async () => {
    mockDelete.mockResolvedValue({ deleted: 0 });

    const out = (await mcpForgetUserNote('501', { note_ref: 'note_999' })) as {
      deleted: boolean;
      error: string;
    };

    // This is the whole bug: the answer must not read as success.
    expect(out.deleted).toBe(false);
    expect(out.error).toContain('Do NOT tell');
  });

  it('refuses a ref it cannot read rather than guessing at an id', async () => {
    const out = (await mcpForgetUserNote('501', { note_ref: 'nonsense' })) as {
      deleted: boolean;
    };

    expect(out.deleted).toBe(false);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
