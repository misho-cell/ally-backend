jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  stripPhoneNumbers,
  listPrivateContext,
  deletePrivateContextKeys,
} from '../userPrivateContext.service';
import { deleteUserNotes } from '../userNotes.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

// Ticket 9 Task 19.3: the founder's private context held three phone numbers
// in plain text, written by the assistant, on a store nobody could read back.
describe('stripPhoneNumbers', () => {
  it('removes a Georgian mobile in the shapes people actually type', () => {
    for (const written of ['+995 599 12 34 56', '599123456', '+995599123456', '599 12 34 56']) {
      expect(stripPhoneNumbers(`დაურეკე ${written} ნომერზე`)).not.toMatch(/\d{6}/);
    }
  });

  it('leaves text that only looks numeric alone', () => {
    expect(stripPhoneNumbers('2022 წელს დაიწყო')).toBe('2022 წელს დაიწყო');
  });
});

describe('deleting what the assistant remembered', () => {
  it('deletes only the named keys, and only for that account', async () => {
    await deletePrivateContextKeys('501', ['ოფისი_ძებნა', 'ბუღალტერი']);

    const call = mockQuery.mock.calls[0];
    expect(call?.[0]).toContain('DELETE FROM user_private_context');
    expect(call?.[1]).toEqual(['501', ['ოფისი_ძებნა', 'ბუღალტერი']]);
  });

  it('deletes nothing when given nothing — never a blanket wipe', async () => {
    expect(await deletePrivateContextKeys('501', [])).toEqual({ deleted: 0 });
    expect(await deleteUserNotes('501', [])).toEqual({ deleted: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('scopes a note deletion to the owner', async () => {
    await deleteUserNotes('501', [166, 200]);

    const call = mockQuery.mock.calls[0];
    expect(call?.[0]).toContain('DELETE FROM user_notes');
    expect(call?.[1]).toEqual(['501', [166, 200]]);
  });
});

describe('listPrivateContext', () => {
  it('returns the store with its dates so a person can judge what is stale', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ key: 'გუნდი', value: 'x', updated_at: '2026-07-13' }],
      rowCount: 1,
    } as never);

    const out = await listPrivateContext('501');

    expect(out[0]).toEqual({ key: 'გუნდი', value: 'x', updated_at: '2026-07-13' });
  });
});
