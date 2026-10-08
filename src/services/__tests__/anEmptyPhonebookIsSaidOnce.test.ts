jest.mock('../../db/postgres/client', () => ({ query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { NO_CONTACTS_YET_SECTION, noContactsYetSection } from '../noContactsYet';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** 2707 (ON-006 / ON-007, §99.3): a goal on an empty phonebook says so once. */
describe('a goal run with no phonebook', () => {
  beforeEach(() => mockQuery.mockReset());

  it('gets the line on the first owner line of a seat with no contacts', async () => {
    mockQuery.mockResolvedValue({ rows: [{ applies: true }] } as never);
    await expect(noContactsYetSection('179367', 44100)).resolves.toBe(NO_CONTACTS_YET_SECTION);
    expect(mockQuery.mock.calls[0][1]).toEqual(['179367', 44100, 1]);
    expect(NO_CONTACTS_YET_SECTION).toContain('ეს მხოლოდ ერთხელ თქვი.');
  });

  it('gets nothing otherwise, or when the read fails', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ applies: false }] } as never);
    await expect(noContactsYetSection('501', 1)).resolves.toBe('');
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(noContactsYetSection('501', 1)).resolves.toBe('');
  });

  it('is asked only for the owner, on a goal', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '!ownerAbsent && boundTask !== null && threadId !== undefined && forcedMode === undefined',
    );
    expect(chat).toMatch(/contactQuestion \+\s+noContacts \+/u);
  });
});
