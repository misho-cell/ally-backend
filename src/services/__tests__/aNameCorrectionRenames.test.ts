const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  cleanName,
  OWNER_RENAME_SOURCE,
  RenameRefusal,
  renameOwnContact,
} from '../renameContact.service';

beforeEach(() => jest.resetAllMocks());

/**
 * #8527 (the tester's 80752 item 13, case 108): „it is Petashvili, not
 * Fetashvili" was saved as a note and every search kept the old name.
 */
describe('a name correction', () => {
  it('becomes the owner’s newest label for their own contact', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ phone: '+995555000111' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(renameOwnContact('42', '995555000111', '  ნიკა   პეტაშვილი ')).resolves.toEqual({
      renamed: true,
      name: 'ნიკა პეტაშვილი',
    });
    const [lookup, lookupParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(lookup).toContain('"contactId" = $1::int');
    expect(lookupParams).toEqual(['42', '995555000111']);
    const [insert, params, timeout] = mockQuery.mock.calls[1] as [string, unknown[], number];
    expect(insert).toContain('INSERT INTO "UserAlias"');
    expect(params).toEqual(['+995555000111', '42', 'ნიკა პეტაშვილი', OWNER_RENAME_SOURCE]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('changes nothing for a number the owner does not have', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(renameOwnContact('42', '1', 'ნიკა')).resolves.toEqual({
      renamed: false,
      reason: RenameRefusal.NotYourContact,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty name or a sentence without touching the database', async () => {
    expect(cleanName('  ')).toBe(RenameRefusal.NoName);
    expect(cleanName('123')).toBe(RenameRefusal.NoName);
    expect(cleanName('ა'.repeat(81))).toBe(RenameRefusal.TooLong);
    await renameOwnContact('42', '1', '');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is offered to the run as a tool', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const list = chat.slice(chat.indexOf('export const ALWAYS_ON_TOOLS'));
    expect(list.slice(0, 600)).toContain('RENAME_CONTACT_TOOL,');
    expect(chat).toContain("case 'rename_contact': {");
  });
});
